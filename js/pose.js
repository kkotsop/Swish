// MediaPipe Pose (WASM, on-device) wrapper: frame stepping, fps measurement, brightness, key-frame grabs.
import { PoseLandmarker, FilesetResolver } from '../vendor/mediapipe/vision_bundle.mjs';
import { isPlausibleHuman, poseBox } from './precheck.js';
import { subjectCrop, uncropLandmarks } from './crop.js';

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
/**
 * Resolve once the first frame is decoded. iPhone Safari may not decode anything for a video that is not on screen
 * until it is played, which made picking a clip feel stuck: after a short wait we nudge it with a muted play/pause.
 */
export function whenReady(video, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && isFinite(video.duration)) return resolve();
    let done = false, nudged = false;
    const finish = (fn) => {
      if (done) return; done = true;
      clearTimeout(kick); clearTimeout(limit);
      if (nudged) video.pause(); // the frame is decoded: stop the nudge playback
      video.removeEventListener('loadeddata', ok); video.removeEventListener('canplay', ok); video.removeEventListener('error', bad);
      fn();
    };
    const ok = () => { if (video.readyState >= 2) finish(resolve); };
    const bad = () => finish(() => reject(new Error('Could not read this video.')));
    video.addEventListener('loadeddata', ok); video.addEventListener('canplay', ok); video.addEventListener('error', bad);
    const kick = setTimeout(() => { if (done) return; nudged = true; video.play().then(() => { if (done) video.pause(); }).catch(() => {}); }, 250);
    const limit = setTimeout(() => finish(() => reject(new Error('This video is taking too long to open. Try a shorter clip, or record one in Swish.'))), timeoutMs);
    video.load();
  });
}

/** Estimate source frame rate by playing briefly with requestVideoFrameCallback. Returns null if unsupported. */
export function measureFps(video) {
  return new Promise((resolve) => {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return resolve(null);
    const times = [];
    let finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      video.pause(); // no rewind here: whoever uses the clip next seeks to where it needs to be (a seek can take a second on iPhone)
      const d = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0).sort((a, b) => a - b);
      resolve(d.length >= 3 ? 1 / d[d.length >> 1] : null);
    };
    const cb = (_now, meta) => { times.push(meta.mediaTime); if (times.length >= 7) finish(); else video.requestVideoFrameCallback(cb); };
    video.requestVideoFrameCallback(cb);
    video.currentTime = 0;
    video.play().catch(() => finish());
    setTimeout(finish, 800);
  });
}

/** Draw the frame (or a normalised crop of it) scaled so its longest side is at most maxSide. */
function drawFrame(video, canvas, maxSide, crop = null) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const sx = crop ? crop.x * vw : 0, sy = crop ? crop.y * vh : 0, sw = crop ? crop.w * vw : vw, sh = crop ? crop.h * vh : vh;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
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

const mainPose = (poses) => poses.filter(isPlausibleHuman).sort((a, b) => (poseBox(b)?.h || 0) - (poseBox(a)?.h || 0))[0] || null;

/**
 * Run pose on every analysis slot (i / fps) of the clip.
 *
 * Speed: seeking to each frame is very slow on iPhone (hundreds of ms per seek), so the video is simply *played*
 * and each presented frame is analysed as it appears (requestVideoFrameCallback). Playback slows down automatically
 * so the model keeps up with it. Any slot that still gets missed is filled by seeking (or copied from its neighbour
 * if there are only a few). Without requestVideoFrameCallback everything falls back to seeking.
 *
 * Distance: if the player is small in the frame (filmed from the stands) the first frames pick a zoom crop around
 * them and the pass restarts, so the model sees the player in much more detail.
 */
export async function processClip(video, { start, duration, fps }, cfg, onProgress, hooks = {}) {
  const lm = await loadPose(cfg);
  const dbg = (...a) => { if (cfg.debug) console.log('[swish]', ...a); }; // set "debug": true in config/settings.json to trace a run
  const n = Math.floor(duration * fps);
  const canvas = document.createElement('canvas'); // what the model sees: the frame, or a zoomed crop of it
  const view = document.createElement('canvas'); // always the full frame, for the live preview and replay stills
  const EARLY = Math.min(n, 15);
  const S = { per: new Array(n).fill(null), lumas: [], crop: null, checked: false, scouted: false, done: 0, detMs: 0, t0: performance.now() };
  /**
   * Nobody was detected in the whole frame: the player may simply be too small for the model (filmed from the stands).
   * Run the detector on zoomed-in tiles of a few frames; if a person turns up, return a zoom crop around them.
   */
  const scout = async () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const tile = document.createElement('canvas');
    const grid = (tw, th, nx, ny) => { const out = []; for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) out.push({ x: nx > 1 ? (k * (1 - tw)) / (nx - 1) : 0, y: ny > 1 ? (j * (1 - th)) / (ny - 1) : 0, w: tw, h: th }); return out; };
    const levels = [grid(0.5, 0.6, 3, 2), grid(0.3, 0.36, 5, 4)]; // coarse tiles first, then finer ones
    const found = [];
    await lm.setOptions({ runningMode: 'IMAGE' });
    try {
      for (const tiles of levels) {
        for (const f of [0.5, 0.25, 0.75]) {
          await seek(video, start + f * duration);
          for (const c of tiles) {
            drawFrame(video, tile, 512, c);
            for (const p of lm.detect(tile).landmarks) { const full = uncropLandmarks(toLm(p), c); if (isPlausibleHuman(full)) found.push(full); }
          }
          if (found.length) break;
        }
        if (found.length) break;
      }
    } finally { await lm.setOptions({ runningMode: 'VIDEO' }); }
    dbg('scout found', found.length, found[0] && poseBox(found[0]));
    if (!found.length) return null;
    found.sort((a, b) => (poseBox(b)?.h || 0) - (poseBox(a)?.h || 0));
    return subjectCrop([found[0]], vw, vh, { maxHeight: 1 }); // always zoom: it was too small to find at full size
  };
  // A video that is not in the page may never present frames (iOS in particular), so analysis plays it from a 2px,
  // almost transparent element, removed again at the end.
  const hadParent = !!video.parentNode;
  if (!hadParent) { Object.assign(video.style, { position: 'fixed', right: '0', bottom: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none' }); document.body.appendChild(video); }
  /** The first inference compiles shaders / allocates buffers (seconds on some phones). Do that on a still frame, before playback starts. */
  const warmUp = async () => {
    await seek(video, start);
    const t0 = performance.now();
    drawFrame(video, canvas, 512, S.crop);
    videoStamp += 1000 / fps;
    lm.detectForVideo(canvas, videoStamp);
    dbg('warm-up took', Math.round(performance.now() - t0), 'ms');
  };
  const resetTracker = async () => { await lm.setOptions({ runningMode: 'IMAGE' }); await lm.setOptions({ runningMode: 'VIDEO' }); };
  await lm.setOptions({ runningMode: 'VIDEO' });
  video.pause();

  /** Analyse slot i from whatever frame the video is showing. Returns 'restart' when a zoom crop was just chosen. */
  const processFrame = (i, between) => {
    const ctx = drawFrame(video, canvas, 512, S.crop);
    if (!S.crop && S.lumas.length < 4 && S.done % 4 === 0) S.lumas.push(brightnessOf(ctx, canvas.width, canvas.height));
    // everything that reads the video must happen before `between` (which may start the next seek)
    const wantSample = hooks.onSample && i % 2 === 0, wantPreview = hooks.onPreview && i % 3 === 0;
    const src = (wantSample || wantPreview) ? (S.crop ? (drawFrame(video, view, 512, null), view) : canvas) : null;
    if (hooks.onStill && i % 3 === 0) hooks.onStill(video, i);
    if (wantSample) hooks.onSample(src, i);
    if (between) between(); // e.g. start the next seek now, so the decoder works while the model runs
    videoStamp += 1000 / fps;
    const d0 = performance.now();
    const res = lm.detectForVideo(canvas, videoStamp);
    S.detMs += performance.now() - d0;
    let poses = res.landmarks.map(toLm);
    if (S.crop) poses = poses.map((p) => uncropLandmarks(p, S.crop));
    S.per[i] = poses; S.done++;

    if (!S.checked && S.done >= EARLY) { // fail fast on an unusable clip, then decide whether to zoom
      const early = S.per.filter(Boolean);
      const brightness = S.lumas.reduce((a, b) => a + b, 0) / (S.lumas.length || 1);
      if (hooks.earlyCheck) {
        const msg = hooks.earlyCheck({ per: early, brightness, scouted: S.scouted });
        if (msg) throw Object.assign(new Error(msg), { early: true });
      }
      dbg('early check', { frames: early.length, withPerson: early.filter((ps) => mainPose(ps)).length, anyPose: early.filter((ps) => ps.length).length, crop: S.crop, scouted: S.scouted });
      if (!S.crop && !early.some((ps) => mainPose(ps)) && !S.scouted) return 'scout'; // nobody at full size: look for a small, distant player
      S.checked = true;
      if (!S.crop) {
        const c = subjectCrop(early.map(mainPose), video.videoWidth, video.videoHeight);
        if (c) { S.crop = c; return 'restart'; }
      }
    }
    if (wantPreview) hooks.onPreview(src, mainPose(poses));
    if (onProgress) {
      const elapsed = (performance.now() - S.t0) / 1000;
      onProgress(S.done / n, { done: S.done, total: n, etaSec: S.done > 4 ? (elapsed / S.done) * (n - S.done) : null, modelMs: Math.round(S.detMs / S.done), frameMs: Math.round((elapsed * 1000) / S.done) });
    }
    return 'ok';
  };

  const seekRun = async (idxs) => {
    if (!idxs.length) return 'ok';
    video.pause();
    await seek(video, start + idxs[0] / fps);
    for (let k = 0; k < idxs.length; k++) {
      const next = k + 1 < idxs.length ? () => { seekRun.pending = seek(video, start + idxs[k + 1] / fps); } : null;
      seekRun.pending = null;
      const r = processFrame(idxs[k], next);
      if (r !== 'ok') return r;
      if (seekRun.pending) await seekRun.pending; else await new Promise((r) => setTimeout(r));
    }
    return 'ok';
  };

  const playRun = () => new Promise((resolve) => {
    let nextI = 0, rate = 0.5, ema = 0, last = performance.now(), finished = false;
    const finish = (status, err) => {
      if (finished) return; finished = true; clearInterval(watchdog);
      if (status === 'stall') dbg('stall', { t: video.currentTime, paused: video.paused, ended: video.ended, rate: video.playbackRate, readyState: video.readyState, frames: seen });
      video.pause(); try { video.playbackRate = 1; } catch { /* ignore */ }
      resolve({ status, err });
    };
    let seen = 0; // frames received so far: the first one may take a while to arrive, later ones should not
    const watchdog = setInterval(() => { if (performance.now() - last > (seen ? 3000 : 6000)) finish('stall'); }, 1000);
    const cb = (_now, meta) => {
      if (finished) return;
      seen++;
      const mt = meta.mediaTime - start, tNext = nextI / fps;
      if (mt >= tNext - 0.004) { // this presented frame is (the first at or after) the next analysis slot
        const idx = nextI + Math.max(0, Math.floor((mt - tNext + 0.004) * fps)); // slots we were too slow for are skipped
        if (idx >= n) return finish('ok');
        let r; const p0 = performance.now();
        try { r = processFrame(idx); } catch (e) { return finish('error', e); }
        if (r !== 'ok') return finish(r); // 'restart' (zoom crop chosen) or 'scout' (look for a distant player)
        nextI = idx + 1;
        const ms = performance.now() - p0;
        ema = ema ? ema * 0.7 + ms * 0.3 : ms;
        const want = Math.max(0.1, Math.min(1, 1000 / fps / (ema * 1.35 + 4)));
        dbg('frame', idx, 'took', Math.round(ms), 'ms, rate', rate.toFixed(2), '->', want.toFixed(2), 't', video.currentTime.toFixed(2)); // slow the video so a slot lasts longer than the model call
        if (Math.abs(want - rate) / rate > 0.2) { rate = want; try { video.playbackRate = rate; } catch { /* ignore */ } }
        if (nextI >= n) return finish('ok');
      }
      last = performance.now(); // measured from the end of the work: a long model call (the first one warms up) is not a stall
      if (mt > duration + 0.15 || video.ended) return finish('ok');
      video.requestVideoFrameCallback(cb);
    };
    (async () => {
      await seek(video, start);
      try { video.playbackRate = rate; } catch { /* ignore */ }
      video.requestVideoFrameCallback(cb);
      last = performance.now();
      try { await video.play(); } catch { finish('noplay'); }
    })();
  });

  const all = Array.from({ length: n }, (_, i) => i);
  const canPlay = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  for (let attempt = 0; attempt < 3; attempt++) {
    S.per.fill(null); S.done = 0; S.detMs = 0; S.t0 = performance.now();
    dbg('pass', attempt, 'crop', S.crop);
    if (attempt > 0) await resetTracker(); // new crop: forget the previous full-frame tracking
    if (canPlay) await warmUp();
    let status;
    if (canPlay) {
      const r = await playRun();
      if (r.err) throw r.err;
      status = r.status;
    } else status = await seekRun(all);
    // complete any slots the playback pass missed (a stalled or partial playback falls back to seeking)
    if (status === 'ok' || status === 'stall' || status === 'noplay') {
      const missing = all.filter((i) => !S.per[i]);
      if (missing.length && missing.length <= Math.max(2, Math.round(n * 0.08))) {
        for (const i of missing) { // a few gaps: reuse the nearest analysed neighbour
          let j = i; while (j >= 0 && !S.per[j]) j--; if (j < 0) { j = i; while (j < n && !S.per[j]) j++; }
          S.per[i] = S.per[j] || [];
        }
        status = 'ok';
      } else if (missing.length) {
        status = await seekRun(missing); // may itself ask for a zoom crop or a scout
      } else status = 'ok';
    }
    dbg('pass', attempt, 'ended with', status, 'frames done', S.done);
    if (status === 'scout') { // zoomed search for a distant player, then run again (with a crop if one was found)
      S.scouted = true;
      S.crop = await scout();
      dbg('scout crop', S.crop);
      continue;
    }
    if (status === 'restart') continue; // a zoom crop was chosen: run again with it
    break;
  }
  video.pause();
  if (!hadParent) video.remove();
  const times = all.map((i) => i / fps);
  return { per: S.per.map((p) => p || []), times, aspect: video.videoWidth / video.videoHeight, brightness: S.lumas.reduce((a, b) => a + b, 0) / (S.lumas.length || 1), crop: S.crop, modelMs: Math.round(S.detMs / Math.max(1, S.done)) };
}

/** Grab a still (JPEG data URL, max 960px wide) at an analysis time offset; the report crops it to the player. */
export async function grabFrame(video, t) {
  await seek(video, t);
  const canvas = document.createElement('canvas');
  const s = Math.min(1, 960 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * s); canvas.height = Math.round(video.videoHeight * s);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
