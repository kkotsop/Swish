// Swish app shell: screens and navigation. State lives in `S`; every screen is a function that mounts into #app.
import { h, mount, toast, topbar, avatar, buzz } from './ui.js';
import * as store from './store.js';
import { MOVES } from './moves.js';
import { guideSvg } from './guide.js';
import { beep, onOrientationChange, openCamera, orientationNow, recordFor, stopStream, unlockAudio } from './capture.js';
import { makeVideo, measureFps, preloadPose, whenReady } from './pose.js';
import { checkFps, checkOrientation } from './precheck.js';
import { runAnalysis } from './analyze.js';
import { renderReport } from './report.js';
import { lineChart, trend } from './progress.js';
import { drawSkeleton } from './skeleton.js';
import { icon, ballSvg } from './icons.js';
import { initPress } from './motion.js';
import { token } from './tokens.js';

const S = { config: null, profile: null, move: null, cleanup: null, lastFile: null };

function go(screen, ...args) {
  if (S.cleanup) { try { S.cleanup(); } catch { /* ignore */ } S.cleanup = null; }
  screen(...args);
}

// ---------- 1. Profile (one player, saved once) ----------
function profileScreen() {
  let photo = null;
  const name = h('input', { type: 'text', placeholder: 'Your name', maxlength: 24, 'aria-label': 'Your name', autocomplete: 'off' });
  const preview = h('span', { class: 'ico-slot' }, icon('plus'));
  const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    photo = await store.resizePhoto(f);
    preview.replaceChildren(photo ? h('img', { src: photo, alt: '' }) : icon('plus'));
  } });
  const create = h('button', { class: 'btn', onClick: () => {
    const n = name.value.trim();
    if (!n) return toast('Enter your name first');
    const p = { id: store.newId(), name: n, photo };
    store.saveProfile(p); S.profile = p; store.setLastProfile(p.id); go(moveScreen);
  } }, 'Continue');
  mount(h('div', { class: 'screen' },
    h('div', { class: 'brand' }, h('img', { src: 'swish-icons/icon-192.png', alt: '' }), h('b', {}, 'Swish')),
    h('h1', { 'data-focus': '' }, 'Who\u2019s shooting?'),
    h('p', {}, 'Everything stays on this phone.'),
    h('div', { class: 'row' }, h('button', { class: 'avatar add', onClick: () => file.click(), 'aria-label': 'Choose photo' }, preview), name),
    file, h('div', { class: 'spacer' }), create));
}

// ---------- 2. Move ----------
function topRow() {
  return h('div', { class: 'brand' }, h('img', { src: 'swish-icons/icon-192.png', alt: '' }), h('b', {}, 'Swish'),
    h('button', { class: 'back push', onClick: () => go(progressScreen, MOVES.shooting), 'aria-label': 'Progress' }, icon('chart', 22)),
    avatar(S.profile, 40));
}

function moveScreen() {
  const moves = Object.values(MOVES);
  let current = 0;
  const cards = moves.map((m, i) => h('button', { class: `move${m.available ? '' : ' soon'}`, 'aria-label': `${m.name}${m.available ? '' : ', coming soon'}`, 'aria-disabled': m.available ? null : 'true',
    onClick: () => { if (m.available) { S.move = m; setTimeout(() => go(filmScreen), 140); } else toast(`${m.name} is coming soon`); } },
    h('span', { class: `art${m.flip ? ' flip' : ''}` }, icon(m.glyph || 'ball', 64)),
    h('b', {}, m.name), h('small', {}, m.blurb)));
  const dots = moves.map(() => h('i'));
  const start = h('button', { class: 'btn' }, 'Start');
  const sync = () => {
    const m = moves[current];
    dots.forEach((d, i) => d.classList.toggle('on', i === current));
    start.disabled = !m.available;
    if (m.available) start.replaceChildren(icon('camera', 20), `Start ${m.name.toLowerCase()}`); else start.replaceChildren('Coming soon');
  };
  start.addEventListener('click', () => { const m = moves[current]; if (m.available) { S.move = m; setTimeout(() => go(filmScreen), 140); } });
  const track = h('div', { class: 'carousel', tabindex: '0', 'aria-label': 'Moves, swipe sideways' }, cards);
  track.addEventListener('scroll', () => {
    const c = track.getBoundingClientRect(); const mid = c.left + c.width / 2;
    let best = 0, bd = 1e9;
    cards.forEach((el, i) => { const r = el.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = i; } });
    if (best !== current) { current = best; sync(); buzz(6); }
  }, { passive: true });
  const depth = () => { // cards shrink and dim as they leave the centre, like a stack of physical cards
    const c = track.getBoundingClientRect(), mid = c.left + c.width / 2;
    cards.forEach((el) => { const r = el.getBoundingClientRect(); el.style.setProperty('--d', Math.min(1, Math.abs(r.left + r.width / 2 - mid) / r.width).toFixed(3)); });
  };
  track.addEventListener('scroll', depth, { passive: true });
  mount(h('div', { class: 'screen home' },
    topRow(),
    h('h1', { 'data-focus': '' }, `Hey ${S.profile.name}.`),
    h('div', { class: 'carousel-wrap' }, track, h('div', { class: 'dots', 'aria-hidden': 'true' }, dots)),
    start));
  sync();
  requestAnimationFrame(depth);
}

// ---------- 3. Film: where to stand, then upload or record, on one screen ----------
function filmScreen(view = 'side') {
  const input = h('input', { type: 'file', accept: 'video/*', style: { display: 'none' } });
  const stage = h('div', { class: 'stage' }, guideSvg(view));
  const tipsEl = tips();
  const loader = h('div', { class: 'loader', hidden: true, role: 'status' }, h('div', { class: 'bar' }, h('i')), h('p', {}, 'Reading your video…'));
  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filming angle' },
    h('button', { class: view === 'side' ? 'on' : '', 'aria-pressed': String(view === 'side'), onClick: () => go(filmScreen, 'side') }, 'From the side'),
    h('button', { class: view === 'front' ? 'on' : '', 'aria-pressed': String(view === 'front'), onClick: () => go(filmScreen, 'front') }, 'From the front'));
  const pick = h('button', { class: 'btn', onClick: () => { preloadPose(S.config); input.click(); } }, icon('upload', 20), 'Choose a video');
  const actions = h('div', { class: 'stack' }, pick,
    h('button', { class: 'btn alt', onClick: () => go(recordScreen) }, icon('camera', 20), 'Record'),
    S.lastFile ? h('button', { class: 'btn ghost', onClick: () => begin(S.lastFile) }, icon('retry', 18), 'Use the last video again') : null, input);
  // Once a clip is picked, a still of its first frame replaces the animation and the loader sits under it. The video itself
  // stays off-screen: frame-rate measurement plays and rewinds it, which showed up as flicker.
  const begin = (file) => {
    actions.classList.add('busy'); tabs.classList.add('busy');
    tipsEl.hidden = true; loader.hidden = false;
    preloadPose(S.config);
    return startUpload(file, (v) => {
      v.addEventListener('loadeddata', () => {
        try {
          const s = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          stage.replaceChildren(c); stage.classList.add('has-video');
        } catch { /* keep the animation if the frame cannot be read */ }
      }, { once: true });
    });
  };
  input.addEventListener('change', () => {
    const f = input.files[0];
    input.value = ''; // so picking the same video again still fires a change event
    if (f) begin(f);
  });
  mount(h('div', { class: 'screen' }, topbar(S.move.name, () => go(moveScreen)), tabs, stage, h('div', { class: 'slot' }, tipsEl, loader), actions));
  setTimeout(() => preloadPose(S.config), 2500); // warm the pose model once the screen has settled, not while you are tapping in
}

// ---------- 4. Record ----------
function recordScreen() {
  const body = h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '12px' } });
  mount(h('div', { class: 'screen' }, topbar('Record a shot', () => go(filmScreen)), body));
  recordPane(body);
}
const captureScreen = (tab = 'upload') => (tab === 'record' ? recordScreen() : filmScreen());

/** The camera (and its permission prompt) is only started once the user taps "Open camera". */
const tips = () => h('div', { class: 'tips' }, ['60 fps+', 'Phone upright, 3 m', 'Full body in frame'].map((t) => h('span', { class: 'pill' }, icon('check', 14), t)));

function recordPane(body) {
  const intro = h('div', { class: 'tile-wrap' },
    h('div', { class: 'drop' },
      h('span', { class: 'drop-ico' }, icon('camera', 34)),
      h('h2', {}, 'Record a shot'),
      p5('Camera opens when you tap. Nothing records until you press Record.'),
      h('button', { class: 'btn', onClick: () => { intro.remove(); startRecorder(body); } }, icon('camera', 20), 'Open camera')),
    tips());
  body.append(intro);
}

async function startRecorder(body) {
  let stream = null, busy = false, countdown = 5;
  const video = h('video', { autoplay: true, muted: true, playsinline: true });
  video.muted = true;
  const count = h('div', { class: 'count' });
  const badge = h('div', { class: 'rec', style: { display: 'none' } }, 'REC');
  const overlay = h('div', { class: 'overlay-msg', style: { display: 'none' } });
  const cam = h('div', { class: 'cam' }, video, h('div', { class: 'frame-guide' }), count, badge, overlay);
  const opts = [3, 5, 10].map((n) => h('button', { class: n === countdown ? 'on' : '', onClick: (e) => { countdown = n; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, `${n}s`));
  const recBtn = h('button', { class: 'btn', disabled: true }, icon('record', 22), 'Record');
  body.append(cam, h('div', { class: 'row' }, h('b', {}, 'Countdown'), h('div', { class: 'seg spacer' }, opts)), recBtn);

  const want = S.move.orientation;
  const syncOrientation = () => {
    const wrong = orientationNow() !== want;
    overlay.style.display = wrong ? 'grid' : 'none';
    overlay.textContent = wrong ? `Please rotate your phone to ${want} for this move.` : '';
    recBtn.disabled = wrong || busy || !stream;
  };
  const offOri = onOrientationChange(syncOrientation);
  S.cleanup = () => { offOri(); stopStream(stream); };

  try {
    stream = await openCamera(want);
    video.srcObject = stream;
    await video.play().catch(() => {});
    syncOrientation();
  } catch (e) {
    overlay.style.display = 'grid'; overlay.textContent = e.message;
  }

  recBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; recBtn.disabled = true; unlockAudio();
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    for (let n = countdown; n > 0; n--) { count.textContent = String(n); beep(660, 140); await new Promise((r) => setTimeout(r, 1000)); }
    count.textContent = '';
    try {
      const secs = S.config.clipSeconds;
      const blob = await recordFor(stream, secs, { onStart: () => { beep(1200, 260, 0.35); badge.style.display = ''; }, onStop: () => { beep(500, 260, 0.35); badge.style.display = 'none'; } });
      stopStream(stream); stream = null;
      S.lastFile = null;
      const v = makeVideo(blob);
      await whenReady(v);
      go(analyzeScreen, { video: v, start: 0, duration: Math.min(secs, v.duration || secs), fps: settings.frameRate || null, source: 'record' });
    } catch (e) {
      busy = false; recBtn.disabled = false; count.textContent = '';
      go(errorScreen, e.message);
    }
  });
}

/** Read an uploaded file and route it to trim or analysis. Used by the picker and by "try this clip again". */
async function startUpload(file, onVideo) {
  S.lastFile = file;
  try {
    const v = makeVideo(file);
    if (onVideo) onVideo(v);
    await whenReady(v);
    const fps = await measureFps(v);
    const fpsCheck = fps ? checkFps(fps, S.config) : null;
    const msg = (fpsCheck && fpsCheck.level === 'block' && fpsCheck.message) || checkOrientation(v.videoWidth, v.videoHeight, S.move.orientation);
    if (msg) return go(errorScreen, msg);
    const clip = { video: v, fps, source: 'upload', total: v.duration };
    if (v.duration > S.config.clipSeconds + 0.3) go(trimScreen, clip); else go(analyzeScreen, { ...clip, start: 0, duration: v.duration });
  } catch (e) { go(errorScreen, e.message || 'Could not read this video.'); }
}

// ---------- 4b. Trim ----------
function trimScreen(clip) {
  const MAXW = S.config.clipSeconds, MINW = 1.5, dur = clip.video.duration;
  let a = 0, b = Math.min(MAXW, dur);
  const v = clip.video; v.controls = false; v.loop = false;
  const ia = h('input', { type: 'range', min: 0, max: dur, step: 0.05, value: a, 'aria-label': 'Start' });
  const ib = h('input', { type: 'range', min: 0, max: dur, step: 0.05, value: b, 'aria-label': 'End' });
  const win = h('div', { class: 'win' });
  const label = h('b', {});
  const paint = () => {
    win.style.left = `${(a / dur) * 100}%`; win.style.width = `${((b - a) / dur) * 100}%`;
    label.textContent = `${a.toFixed(1)}s – ${b.toFixed(1)}s (${(b - a).toFixed(1)}s)`;
  };
  ia.addEventListener('input', () => { a = +ia.value; if (b - a > MAXW) b = a + MAXW; if (b - a < MINW) b = Math.min(dur, a + MINW), a = Math.max(0, b - MINW); ia.value = a; ib.value = b; v.currentTime = a; paint(); });
  ib.addEventListener('input', () => { b = +ib.value; if (b - a > MAXW) a = b - MAXW; if (b - a < MINW) a = Math.max(0, b - MINW), b = Math.min(dur, a + MINW); ia.value = a; ib.value = b; v.currentTime = b; paint(); });
  const play = h('button', { class: 'btn alt', onClick: () => { v.currentTime = a; v.play(); const t = setInterval(() => { if (v.currentTime >= b || v.paused) { v.pause(); clearInterval(t); } }, 50); } }, icon('play', 20), 'Preview');
  paint(); v.currentTime = 0;
  mount(h('div', { class: 'screen trim' }, topbar('Pick the shot', () => go(captureScreen, 'upload')),
    p5(`Choose up to ${MAXW} seconds that include the whole shot: load, jump and release.`), v,
    h('div', { class: 'range' }, h('div', { class: 'track' }), win, ia, ib), h('div', { style: { textAlign: 'center' } }, label),
    h('div', { class: 'spacer' }), h('div', { class: 'stack' }, play,
      h('button', { class: 'btn', onClick: () => go(analyzeScreen, { ...clip, start: a, duration: b - a }) }, 'Analyse'))));
}
const p5 = (t) => h('p', {}, t);

// ---------- 6. Analysis ----------
async function analyzeScreen(clip) {
  const bar = h('div', { class: 'progress-bar' });
  const status = h('h2', { 'data-focus': '' }, 'Analysing');
  const detail = h('p', {}, 'Starting…');
  const preview = h('canvas', { class: 'preview', style: { display: 'none' }, role: 'img', 'aria-label': 'Live view of the player being tracked' });
  const warn = clip.fps && checkFps(clip.fps, S.config);
  mount(h('div', { class: 'screen', style: { alignItems: 'center', textAlign: 'center' } },
    h('div', { class: 'spacer' }), ballSvg(), status, h('div', { class: 'progress-track', style: { width: '100%' }, role: 'progressbar', 'aria-label': 'Analysis progress' }, bar), detail, preview, h('div', { class: 'spacer' }),
    warn ? h('div', { class: 'tiny-note' }, icon('alert', 14), warn.message) : null));
  try {
    const out = await runAnalysis({ clip, move: S.move, config: S.config, onStatus: (t) => { detail.textContent = t; }, onPreview: (src, lm) => { // live view of who is being tracked: green box + skeleton
      preview.style.display = ''; preview.width = src.width; preview.height = src.height;
      const ctx = preview.getContext('2d'); ctx.drawImage(src, 0, 0);
      if (lm) drawSkeleton(ctx, lm, { w: src.width, h: src.height, hand: null });
    },
    onProgress: (p, info) => { bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`; if (info) detail.textContent = `Frame ${info.done} of ${info.total}${info.etaSec != null ? ` · ${Math.max(1, Math.round(info.etaSec))}s left` : ''}`; } });
    if (!out.ok) return go(errorScreen, out.message);
    go(reportScreen, out.result);
  } catch (e) {
    console.error(e);
    go(errorScreen, 'Something went wrong while analysing. Please try again.');
  } finally {
    try { URL.revokeObjectURL(clip.video.src); clip.video.removeAttribute('src'); clip.video.load(); } catch { /* ignore */ }
  }
}

// ---------- 9. Error ----------
function errorScreen(message) {
  mount(h('div', { class: 'screen', style: { justifyContent: 'center', gap: '14px' } },
    h('h1', {}, 'Hold up'),
    h('div', { class: 'panel err' }, h('b', { style: { fontSize: '17px', lineHeight: 1.35 } }, message)),
    h('div', { class: 'stack' },
      S.lastFile ? h('button', { class: 'btn', onClick: () => startUpload(S.lastFile) }, icon('retry', 22), 'Try this video again') : null,
      h('button', { class: S.lastFile ? 'btn alt' : 'btn', onClick: () => go(captureScreen, 'upload') }, 'Choose another video'),
      h('button', { class: 'btn alt', onClick: () => go(captureScreen, 'record') }, 'Record a new one'),
      h('button', { class: 'btn ghost', onClick: () => go(moveScreen) }, 'Home'))));
}

// ---------- 7 + 8. Report (+ save) ----------
function reportScreen(result) {
  store.addSession({
    id: store.newId(), ts: result.ts, profileId: S.profile.id, move: result.move, hand: result.hand, score: result.score,
    metrics: Object.fromEntries(Object.entries(result.metrics).map(([id, m]) => [id, { value: m.value, score: m.score, status: m.status }])),
  }) || toast('Could not save (storage full?)');
  mount(renderReport({ result, move: S.move, profile: S.profile, actions: {
    onRetry: () => go(captureScreen, 'upload'), onProgress: () => go(progressScreen, S.move), onHome: () => go(moveScreen) } }));
}

// ---------- 10. Progress ----------
function deltaBadge(dt, suffix = '') {
  if (dt == null) return h('span', {});
  const up = dt > 0, down = dt < 0;
  return h('span', { class: `delta ${up ? 'up' : down ? 'down' : ''}` }, up ? icon('up', 16) : down ? icon('down', 16) : icon('dash', 16), `${up ? '+' : down ? '\u2212' : ''}${Math.abs(dt)}${suffix}`);
}

function progressScreen(move) {
  const sessions = store.sessionsFor(S.profile.id, move.id);
  const overall = sessions.map((s) => ({ ts: s.ts, v: s.score }));
  const d = trend(overall);
  const rows = move.metrics.filter((id) => sessions.some((s) => s.metrics[id])).map((id) => {
    const pts = sessions.filter((s) => s.metrics[id]).map((s) => ({ ts: s.ts, v: s.metrics[id].score }));
    return h('div', { class: 'metric-row' },
      h('div', { class: 'mini' }, h('b', {}, move.copy[id].name), deltaBadge(trend(pts))),
      lineChart(pts, { height: 70, color: token('--good'), label: false }));
  });
  mount(h('div', { class: 'screen' }, topbar(`${move.name} progress`, () => go(moveScreen)),
    sessions.length ? [
      h('div', { class: 'hero-stat' },
        h('div', { class: 'lbl' }, 'Overall score'), h('div', { class: 'big' }, String(overall[overall.length - 1].v)),
        d == null ? h('span', { class: 'lbl' }, `${sessions.length} session`) : h('span', { class: 'delta' }, d > 0 ? icon('up', 16) : d < 0 ? icon('down', 16) : icon('dash', 16), `${d > 0 ? '+' : d < 0 ? '\u2212' : ''}${Math.abs(d)} since last`),
        lineChart(overall, { height: 120, color: token('--pink') })),
      h('div', { class: 'stack' }, rows)]
      : [h('div', { class: 'panel stack' }, h('h2', {}, 'No sessions yet'), p5(`Record your first ${move.name.toLowerCase()} clip to start tracking.`), h('button', { class: 'btn', onClick: () => go(filmScreen) }, icon('camera', 22), 'Record now'))]));
}

// ---------- boot ----------
document.addEventListener('touchstart', () => {}, { passive: true }); // lets iOS Safari react the instant a finger lands
initPress();
(async function boot() {
  try { S.config = await store.loadConfig(); } catch { mount(h('div', { class: 'screen' }, h('h1', {}, 'Offline'), p5('Could not load settings. Open Swish once with a connection.'))); return; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const me = store.listProfiles().find((p) => p.id === store.lastProfileId()) || store.listProfiles()[0];
  if (me) { S.profile = me; moveScreen(); } else profileScreen();
})();
