// MediaPipe Pose (WASM, on-device) wrapper: frame stepping, fps measurement, brightness, key-frame grabs.
import { PoseLandmarker, FilesetResolver } from '../vendor/mediapipe/vision_bundle.mjs';

let landmarker = null;
let loading = null;
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
      resolve(d.length >= 5 ? 1 / d[d.length >> 1] : null);
    };
    const cb = (_now, meta) => { times.push(meta.mediaTime); if (times.length >= 20) finish(); else video.requestVideoFrameCallback(cb); };
    video.requestVideoFrameCallback(cb);
    video.currentTime = 0;
    video.play().catch(() => finish());
    setTimeout(finish, 2500);
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
const toLm = (arr) => arr.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 1 }));

/** Cheap probe on a few evenly spaced frames, used for the quality pre-check before heavy processing. */
export async function probeClip(video, { start, duration, samples = 8 }, cfg) {
  const lm = await loadPose(cfg);
  await lm.setOptions({ runningMode: 'IMAGE' });
  const canvas = document.createElement('canvas');
  const per = [], times = [], br = [];
  for (let i = 0; i < samples; i++) {
    const t = start + ((i + 0.5) / samples) * duration;
    await seek(video, t);
    const ctx = drawFrame(video, canvas, 480);
    br.push(brightnessOf(ctx, canvas.width, canvas.height));
    const res = lm.detect(canvas);
    per.push(res.landmarks.map(toLm)); times.push(t);
  }
  await lm.setOptions({ runningMode: 'VIDEO' });
  return { per, times, brightness: br.reduce((a, b) => a + b, 0) / br.length };
}

/** Full pass: step through the clip at `fps`, run pose on each frame. */
export async function processClip(video, { start, duration, fps }, cfg, onProgress) {
  const lm = await loadPose(cfg);
  await lm.setOptions({ runningMode: 'VIDEO' });
  const canvas = document.createElement('canvas');
  const n = Math.floor(duration * fps);
  const per = [], times = [];
  let stamp = 0;
  for (let i = 0; i < n; i++) {
    const t = start + i / fps;
    await seek(video, t);
    drawFrame(video, canvas, 720);
    stamp += 1000 / fps;
    const res = lm.detectForVideo(canvas, stamp);
    per.push(res.landmarks.map(toLm)); times.push(i / fps);
    if (i % 3 === 0) { onProgress && onProgress((i + 1) / n); await new Promise((r) => setTimeout(r)); }
  }
  onProgress && onProgress(1);
  return { per, times, aspect: video.videoWidth / video.videoHeight };
}

/** Grab a still (JPEG data URL, max 540px wide) at an analysis time offset. */
export async function grabFrame(video, t) {
  await seek(video, t);
  const canvas = document.createElement('canvas');
  const s = Math.min(1, 540 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * s); canvas.height = Math.round(video.videoHeight * s);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
