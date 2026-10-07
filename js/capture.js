// Camera access, countdown beeps and fixed-length recording.
let audioCtx = null;
export function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* no audio */ }
}
export function beep(freq = 880, ms = 120, vol = 0.25) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.value = freq; o.type = 'sine';
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + ms / 1000);
}

export const orientationNow = () => (window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape');
export function onOrientationChange(cb) {
  const mq = window.matchMedia('(orientation: portrait)');
  const fn = () => cb(orientationNow());
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}

/** Open the rear camera, preferring 60 fps. Throws a friendly Error on permission problems. */
export async function openCamera(orientation) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the camera. Open Swish from your home screen in Safari.');
  const portrait = orientation !== 'landscape';
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: portrait ? 1080 : 1920 }, height: { ideal: portrait ? 1920 : 1080 }, frameRate: { ideal: 60 } },
    });
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      throw new Error('Swish needs camera access to record your shot. Allow it in Settings > Safari > Camera (or Settings > Swish), then try again. You can also upload a clip instead.');
    }
    if (e && e.name === 'NotFoundError') throw new Error('No camera found. You can upload a clip instead.');
    throw new Error('Could not start the camera. You can upload a clip instead.');
  }
}
export const stopStream = (s) => s && s.getTracks().forEach((t) => t.stop());

export function pickMime() {
  for (const m of ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

/** Record for a fixed time and resolve with a Blob. */
export function recordFor(stream, seconds, hooks = {}) {
  return new Promise((resolve, reject) => {
    if (!window.MediaRecorder) return reject(new Error('Recording is not supported in this browser. Please upload a clip instead.'));
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.onerror = () => reject(new Error('Recording failed. Please try again.'));
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mime || 'video/mp4' }));
    rec.start(250);
    hooks.onStart && hooks.onStart();
    const t0 = performance.now();
    const tick = setInterval(() => hooks.onTick && hooks.onTick(Math.min(seconds, (performance.now() - t0) / 1000)), 100);
    setTimeout(() => { clearInterval(tick); if (rec.state !== 'inactive') rec.stop(); hooks.onStop && hooks.onStop(); }, seconds * 1000);
  });
}
