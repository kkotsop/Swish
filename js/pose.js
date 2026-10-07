// MediaPipe Pose (WASM, on-device) wrapper: frame stepping, fps measurement, brightness, key-frame grabs.
import { PoseLandmarker, FilesetResolver } from '../vendor/mediapipe/vision_bundle.mjs';
import { isPlausibleHuman, poseBox } from './precheck.js';

let landmarker = null;
let loading = null;
// MediaPipe VIDEO mode needs strictly increasing timestamps for the lifetime of the landmarker, so this
// counter must keep growing across clips (restarting at 0 breaks the 2nd video analysed in a session).
let videoStamp = 0;
const WASM = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../models/pose_landmarker_full.task', import.meta.url).href;

export async function loadPose(cfg = {}) {
  if (landmarker) return landmarker;
  if (loading) return loading;
  loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 2,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { landmarker = await make(cfg.delegate || 'GPU'); } catch { landmarker = await make('CPU'); }
    return landmarker;
  })();
  try { return await loading; } finally { loading = null; }
}

export function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = Math.max(0, Math.min(t, (video.duration || t) - 0.001));
    setTimeout(done, 1500); // never hang on a missed event
  });
}

export function makeVideo(blobOrUrl) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
  v.src = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  return v;
}
export function whenReady(video) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && isFinite(video.duration)) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Could not read this video.')), { once: true });
    video.load();
  });
}

/** Estimate source frame rate by playing briefly with requestVideoFrameCallback. Returns null if unsupported. */
export function measureFps(video) {
  return new Promise((resolve) => {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return resolve(null);
    const times = [];
    let finished = false;
    const finish = async () => {
      if (finished) return; finished = true;
      video.pause();
      const d = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0).sort((a, b) => a - b);
      await seek(video, 0);
      resolve(d.length >= 4 ? 1 / d[d.length >> 1] : null);
    };
    const cb = (_now, meta) => { times.push(meta.mediaTime); if (times.length >= 10) finish(); else video.requestVideoFrameCallback(cb); };
    video.requestVideoFrameCallback(cb);
    video.currentTime = 0;
    video.play().catch(() => finish());
    setTimeout(finish, 1500);
  });
}

function drawFrame(video, canvas, maxSide) {
  const s = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.round(video.videoWidth * s), h = Math.round(video.videoHeight * s);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  return ctx;
}
function brightnessOf(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 64) { sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
  return sum / n;
}
/** Warm up the WASM runtime and model in the background so "Analyse" doesn't wait for it. */
export function preloadPose(cfg) { loadPose(cfg).catch(() => {}); }

const toLm = (arr) => arr.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 1 }));

/**
 * Full pass: step through the clip at `fps`, run pose on each frame.
 * Speed: the seek for frame i+1 is started *before* pose inference runs on frame i, so the video decoder
 * works while the (synchronous) model call blocks the main thread. Seek latency is the main cost on iOS.
 */
export async function processClip(video, { start, duration, fps }, cfg, onProgress, hooks = {}) {
  const lm = await loadPose(cfg);
  await lm.setOptions({ runningMode: 'VIDEO' });
  const canvas = document.createElement('canvas');
  const n = Math.floor(duration * fps);
  const per = [], times = [], lumas = [];
  const EARLY = Math.min(n - 1, 14);
  const t0 = performance.now();
  await seek(video, start);
  for (let i = 0; i < n; i++) {
    const ctx = drawFrame(video, canvas, 512);
    if (i === 0 || i === 4 || i === 9 || i === EARLY) lumas.push(brightnessOf(ctx, canvas.width, canvas.height));
    const next = i + 1 < n ? seek(video, start + (i + 1) / fps) : null;
    videoStamp += 1000 / fps;
    const res = lm.detectForVideo(canvas, videoStamp);
    const poses = res.landmarks.map(toLm);
    per.push(poses); times.push(i / fps);
    if (i === EARLY && hooks.earlyCheck) { // fail fast on a clip that is clearly unusable
      const msg = hooks.earlyCheck({ per, brightness: lumas.reduce((a, b) => a + b, 0) / lumas.length });
      if (msg) throw Object.assign(new Error(msg), { early: true });
    }
    if (hooks.onSample && i % 2 === 0) hooks.onSample(canvas, i);
    if (hooks.onPreview && i % 3 === 0) {
      const main = poses.filter(isPlausibleHuman).sort((a, b) => (poseBox(b)?.h || 0) - (poseBox(a)?.h || 0))[0] || null;
      hooks.onPreview(canvas, main);
    }
    if (onProgress) {
      const done = i + 1, elapsed = (performance.now() - t0) / 1000;
      onProgress(done / n, { done, total: n, etaSec: done > 4 ? (elapsed / done) * (n - done) : null });
    }
    if (next) await next; else await new Promise((r) => setTimeout(r));
  }
  return { per, times, aspect: video.videoWidth / video.videoHeight, brightness: lumas.reduce((a, b) => a + b, 0) / lumas.length };
}

/** Grab a still (JPEG data URL, max 540px wide) at an analysis time offset. */
export async function grabFrame(video, t) {
  await seek(video, t);
  const canvas = document.createElement('canvas');
  const s = Math.min(1, 960 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * s); canvas.height = Math.round(video.videoHeight * s);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
