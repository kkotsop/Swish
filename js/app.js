// Swish app shell: screens and navigation. State lives in `S`; every screen is a function that mounts into #app.
import { h, mount, toast, topbar, avatar } from './ui.js';
import * as store from './store.js';
import { MOVES } from './moves.js';
import { placementSvg } from './guide.js';
import { beep, onOrientationChange, openCamera, orientationNow, recordFor, stopStream, unlockAudio } from './capture.js';
import { makeVideo, measureFps, whenReady } from './pose.js';
import { checkFps, checkOrientation } from './precheck.js';
import { runAnalysis } from './analyze.js';
import { renderReport } from './report.js';
import { lineChart, trend } from './progress.js';

const S = { config: null, profile: null, move: null, cleanup: null };

function go(screen, ...args) {
  if (S.cleanup) { try { S.cleanup(); } catch { /* ignore */ } S.cleanup = null; }
  screen(...args);
}

// ---------- 1. Profile ----------
function profileScreen() {
  const profiles = store.listProfiles();
  const list = profiles.map((p) => h('button', { class: 'tile', onClick: () => { S.profile = p; store.setLastProfile(p.id); go(moveScreen); } },
    h('div', { class: 'row' }, avatar(p, 48), h('b', { style: { fontSize: '20px' } }, p.name))));
  let photo = null;
  const name = h('input', { type: 'text', placeholder: 'Player name', maxlength: 24, 'aria-label': 'Player name' });
  const preview = h('div', { class: 'avatar' }, '+');
  const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    photo = await store.resizePhoto(f);
    preview.replaceChildren(photo ? h('img', { src: photo, alt: '' }) : '+');
  } });
  const create = h('button', { class: 'btn', onClick: () => {
    const n = name.value.trim();
    if (!n) return toast('Enter a name first');
    const p = { id: store.newId(), name: n, photo };
    store.saveProfile(p); S.profile = p; store.setLastProfile(p.id); go(moveScreen);
  } }, 'Create profile');
  mount(h('div', { class: 'screen' },
    h('img', { src: 'swish-icons/icon-192.png', alt: '', width: 64, height: 64, style: { borderRadius: '16px', marginBottom: '8px' } }),
    h('h1', {}, 'Swish'),
    h('p', {}, 'Your pocket basketball coach. Everything stays on this phone.'),
    profiles.length ? h('div', { class: 'stack', style: { marginBottom: '18px' } }, h('b', {}, 'Who is shooting?'), list) : null,
    h('div', { class: 'card stack' },
      h('b', {}, profiles.length ? 'Add a player' : 'Create your first player'),
      h('div', { class: 'row' }, h('button', { class: 'avatar', style: { border: 0, color: 'var(--accent)' }, onClick: () => file.click(), 'aria-label': 'Choose photo' }, preview), name),
      file, create)));
}

// ---------- 2. Move ----------
function moveScreen() {
  const tiles = Object.values(MOVES).map((m) => h('button', { class: 'tile', disabled: !m.available, onClick: () => { S.move = m; go(guideScreen); } },
    h('b', { style: { fontSize: '20px' } }, m.name), h('small', {}, m.blurb)));
  mount(h('div', { class: 'screen' },
    topbar('Pick a move', () => go(profileScreen)),
    h('div', { class: 'row', style: { marginBottom: '14px' } }, avatar(S.profile, 40), h('b', {}, S.profile.name)),
    h('div', { class: 'grid' }, tiles),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn alt', onClick: () => go(progressScreen, MOVES.shooting) }, 'See progress')));
}

// ---------- 3. Camera placement guide ----------
function guideScreen() {
  const g = S.move.guide;
  mount(h('div', { class: 'screen' },
    topbar(g.title, () => go(moveScreen)),
    placementSvg(g.orientation),
    h('ol', { style: { color: 'var(--text)', fontWeight: 700, lineHeight: 1.5, paddingLeft: '22px' } }, g.steps.map((s) => h('li', {}, s))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'stack' }, h('button', { class: 'btn', onClick: () => go(captureScreen) }, 'Got it'),
      h('button', { class: 'btn ghost', onClick: () => go(captureScreen) }, 'Skip'))));
}

// ---------- 4. Capture: record or upload ----------
function captureScreen(tab = 'record') {
  const body = h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '12px' } });
  const seg = h('div', { class: 'seg' },
    h('button', { class: tab === 'record' ? 'on' : '', onClick: () => go(captureScreen, 'record') }, 'Record'),
    h('button', { class: tab === 'upload' ? 'on' : '', onClick: () => go(captureScreen, 'upload') }, 'Upload'));
  mount(h('div', { class: 'screen' }, topbar(S.move.name, () => go(guideScreen)), seg, body));
  (tab === 'record' ? recordPane : uploadPane)(body);
}

async function recordPane(body) {
  let stream = null, busy = false, countdown = 5;
  const video = h('video', { autoplay: true, muted: true, playsinline: true });
  video.muted = true;
  const count = h('div', { class: 'count' });
  const badge = h('div', { class: 'rec', style: { display: 'none' } }, '● REC');
  const overlay = h('div', { class: 'overlay-msg', style: { display: 'none' } });
  const cam = h('div', { class: 'cam' }, video, h('div', { class: 'frame-guide' }), count, badge, overlay);
  const opts = [3, 5, 10].map((n) => h('button', { class: n === countdown ? 'on' : '', onClick: (e) => { countdown = n; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, `${n}s`));
  const recBtn = h('button', { class: 'btn', disabled: true }, 'Record');
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
      const v = makeVideo(blob);
      await whenReady(v);
      go(analyzeScreen, { video: v, start: 0, duration: Math.min(secs, v.duration || secs), fps: settings.frameRate || null, source: 'record' });
    } catch (e) {
      busy = false; recBtn.disabled = false; count.textContent = '';
      go(errorScreen, e.message);
    }
  });
}

function uploadPane(body) {
  const input = h('input', { type: 'file', accept: 'video/*', style: { display: 'none' } });
  const status = h('p', {}, 'Choose a clip from your photo library. It must be 60 fps or higher.');
  const pick = h('button', { class: 'btn', onClick: () => input.click() }, 'Choose a video');
  input.addEventListener('change', async () => {
    const f = input.files[0]; if (!f) return;
    pick.disabled = true; status.textContent = 'Reading your clip…';
    try {
      const v = makeVideo(f);
      await whenReady(v);
      const fps = await measureFps(v);
      const msg = (fps && checkFps(fps, S.config)) || checkOrientation(v.videoWidth, v.videoHeight, S.move.orientation);
      if (msg) return go(errorScreen, msg);
      const clip = { video: v, fps, source: 'upload', total: v.duration };
      if (v.duration > S.config.clipSeconds + 0.3) go(trimScreen, clip); else go(analyzeScreen, { ...clip, start: 0, duration: v.duration });
    } catch (e) { go(errorScreen, e.message || 'Could not read this video.'); }
  });
  body.append(h('div', { class: 'card stack', style: { marginTop: '8px' } }, h('h2', {}, 'Upload a clip'), status, pick, input,
    h('p', {}, 'Tip: slow-motion clips recorded at 120 or 240 fps work great.')));
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
  const play = h('button', { class: 'btn alt', onClick: () => { v.currentTime = a; v.play(); const t = setInterval(() => { if (v.currentTime >= b || v.paused) { v.pause(); clearInterval(t); } }, 50); } }, 'Preview');
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
  const status = h('b', { style: { fontSize: '20px' } }, 'Starting…');
  mount(h('div', { class: 'screen', style: { justifyContent: 'center', gap: '16px' } },
    h('div', { class: 'big-num' }, '🏀'), h('h1', {}, 'Analysing'), status, h('div', { class: 'progress-track' }, bar),
    p5('This takes about 5–15 seconds. Your video stays on this phone and is deleted when we finish.')));
  try {
    const out = await runAnalysis({ clip, move: S.move, config: S.config, onStatus: (t) => { status.textContent = t; }, onProgress: (p) => { bar.style.width = `${Math.round(p * 100)}%`; } });
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
    h('div', { class: 'card err' }, h('b', { style: { fontSize: '19px', lineHeight: 1.35 } }, message)),
    h('div', { class: 'stack' },
      h('button', { class: 'btn', onClick: () => go(captureScreen, 'record') }, 'Record again'),
      h('button', { class: 'btn alt', onClick: () => go(captureScreen, 'upload') }, 'Choose another clip'),
      h('button', { class: 'btn ghost', onClick: () => go(moveScreen) }, 'Home'))));
}

// ---------- 7 + 8. Report (+ save) ----------
function reportScreen(result) {
  store.addSession({
    id: store.newId(), ts: result.ts, profileId: S.profile.id, move: result.move, hand: result.hand, score: result.score,
    metrics: Object.fromEntries(Object.entries(result.metrics).map(([id, m]) => [id, { value: m.value, score: m.score, status: m.status }])),
  }) || toast('Could not save (storage full?)');
  mount(renderReport({ result, move: S.move, profile: S.profile, actions: {
    onRetry: () => go(captureScreen, 'record'), onProgress: () => go(progressScreen, S.move), onHome: () => go(moveScreen) } }));
}

// ---------- 10. Progress ----------
function progressScreen(move) {
  const sessions = store.sessionsFor(S.profile.id, move.id);
  const overall = sessions.map((s) => ({ ts: s.ts, v: s.score }));
  const d = trend(overall);
  const cards = move.metrics.map((id) => {
    const pts = sessions.map((s) => ({ ts: s.ts, v: s.metrics[id]?.score ?? 0 }));
    const dt = trend(pts);
    return h('div', { class: 'card' },
      h('div', { class: 'mini' }, h('b', {}, move.copy[id].name),
        h('span', { class: `delta ${dt > 0 ? 'up' : dt < 0 ? 'down' : ''}` }, dt == null ? '' : `${dt > 0 ? '▲' : dt < 0 ? '▼' : '='} ${Math.abs(dt)}`)),
      lineChart(pts, { height: 70 }));
  });
  mount(h('div', { class: 'screen' }, topbar(`${move.name} progress`, () => go(moveScreen)),
    sessions.length ? [
      h('div', { class: 'card' }, h('div', { class: 'mini' }, h('b', {}, 'Overall score'),
        h('span', { class: `delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}` }, d == null ? `${sessions.length} session` : `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)} since last`)),
        lineChart(overall, { height: 140 })),
      h('div', { class: 'stack', style: { marginTop: '12px' } }, cards)]
      : [h('div', { class: 'card' }, h('h2', {}, 'No sessions yet'), p5(`Record your first ${move.name.toLowerCase()} clip to start tracking.`), h('button', { class: 'btn', onClick: () => go(guideScreen) }, 'Record now'))]));
}

// ---------- boot ----------
(async function boot() {
  try { S.config = await store.loadConfig(); } catch { mount(h('div', { class: 'screen' }, h('h1', {}, 'Offline'), p5('Could not load settings. Open Swish once with a connection.'))); return; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const last = store.listProfiles().find((p) => p.id === store.lastProfileId());
  if (last) { S.profile = last; moveScreen(); } else profileScreen();
})();
