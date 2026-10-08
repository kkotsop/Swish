// Swish app shell: screens and navigation. State lives in `S`; every screen is a function that mounts into #app.
import { h, mount, toast, topbar, avatar, buzz, initials } from './ui.js';
import * as store from './store.js';
import { MOVES } from './moves.js';
import { guideSvg } from './guide.js';
import { makeVideo, measureFps, preloadPose, whenReady } from './pose.js';
import { checkFps } from './precheck.js';
import { runAnalysis } from './analyze.js';
import { renderReport } from './report.js';
import { lineChart, trend } from './progress.js';
import { drawSkeleton } from './skeleton.js';
import { icon, throwSvg, ballFireIcon } from './icons.js';
import { initPress } from './motion.js';
import { token } from './tokens.js';
import { journey, milestones, LADDER, PER_WEEK } from './journey.js';
import { celebrate } from './celebrate.js';

const S = { config: null, profile: null, move: null, cleanup: null, lastFile: null };

function go(screen, ...args) {
  if (S.cleanup) { try { S.cleanup(); } catch { /* ignore */ } S.cleanup = null; }
  screen(...args);
}

/** "Swish v28": read from the service worker file itself, the one place the deployed version is written (also works offline from its cache). */
function versionNote() {
  const p = h('p', { class: 'version' }, 'Swish');
  fetch('sw.js').then((r) => r.text()).then((t) => { const v = /swish-v(\d+)/.exec(t); if (v && p.isConnected) p.textContent = `Swish v${v[1]}`; }).catch(() => {});
  return p;
}

// ---------- 1. Profile (one player, saved once; the same screen edits it later) ----------
function profileScreen(editing = false) {
  const me = editing ? S.profile : null;
  let photo = me ? me.photo : null;
  const name = h('input', { type: 'text', placeholder: 'Your name', maxlength: 24, 'aria-label': 'Your name', autocomplete: 'off', enterkeyhint: 'done', value: me ? me.name : null, onKeydown: (e) => { if (e.key === 'Enter') save.click(); } });
  const initial = () => (me && me.name ? initials(me.name) : null);
  const paint = () => {
    preview.replaceChildren(photo ? h('img', { src: photo, alt: '' }) : (initial() || icon('plus')));
    if (remove) remove.hidden = !photo;
  };
  const preview = h('span', { class: 'ico-slot' });
  const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const resized = await store.resizePhoto(f);
    if (resized) photo = resized; else toast('Could not read that photo');
    paint();
    e.target.value = '';
  } });
  const remove = editing ? h('button', { class: 'btn ghost', onClick: () => { photo = null; paint(); } }, 'Remove photo') : null;
  const save = h('button', { class: 'btn', onClick: () => {
    const n = name.value.trim();
    if (!n) return toast('Enter your name first');
    const p = me ? { ...me, name: n, photo } : { id: store.newId(), name: n, photo };
    if (!store.saveProfile(p)) return toast('Could not save (storage full?)');
    S.profile = p; store.setLastProfile(p.id);
    if (editing) toast('Saved');
    go(moveScreen);
  } }, editing ? 'Save' : 'Continue');
  const picker = h('button', { class: `avatar${editing ? ' big' : ' add'}`, onClick: () => file.click(), 'aria-label': photo ? 'Change photo' : 'Choose photo' }, preview, editing ? h('span', { class: 'cam-badge' }, icon('camera', 18)) : null);
  paint();
  if (editing) {
    mount(h('div', { class: 'screen' }, topbar('Your profile', () => go(moveScreen)),
      h('div', { class: 'edit-photo' }, picker, h('button', { class: 'btn alt small', onClick: () => file.click() }, photo ? 'Change photo' : 'Add a photo')),
      h('label', { class: 'field' }, h('span', {}, 'Name'), name), remove, file, h('div', { class: 'spacer' }), save, versionNote()));
    return;
  }
  mount(h('div', { class: 'screen' },
    h('div', { class: 'brand' }, h('img', { src: 'swish-icons/icon-192.png', alt: '' }), h('b', {}, 'Swish')),
    h('h1', { 'data-focus': '' }, 'Who\u2019s shooting?'),
    h('p', {}, 'Everything stays on this phone.'),
    h('div', { class: 'row' }, picker, name),
    file, h('div', { class: 'spacer' }), save));
}

// ---------- 2. Move ----------
function topRow() {
  return h('div', { class: 'brand' }, h('img', { src: 'swish-icons/icon-192.png', alt: '' }), h('b', {}, 'Swish'),
    h('button', { class: 'back push', onClick: () => go(progressScreen, MOVES.shooting), 'aria-label': 'Progress' }, icon('chart', 22)),
    h('button', { class: 'avatar-btn', onClick: () => go(profileScreen, true), 'aria-label': 'Your profile' }, avatar(S.profile, 40)));
}

function moveScreen() {
  const moves = Object.values(MOVES);
  let current = 0;
  const cards = moves.map((m, i) => h('button', { class: `move${m.available ? '' : ' soon'}${m.photo ? ' photo' : ''}`, 'aria-label': `${m.name}${m.available ? '' : ', coming soon'}`, 'aria-disabled': m.available ? null : 'true',
    onClick: () => { if (m.available) { S.move = m; setTimeout(() => go(filmScreen), 140); } else toast(`${m.name} is coming soon`); } },
    h('b', {}, m.name), h('small', {}, m.blurb)));
  moves.forEach((m, i) => { if (m.photo) { cards[i].style.setProperty('--photo', `url(${m.available ? m.photo : (m.photoSoon || m.photo)})`); cards[i].style.setProperty('--focus', m.focus || '50% 40%'); } }); // custom properties need setProperty
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
  // One scroll handler, at most once per frame: read every card position first, then write (no forced re-layout).
  // Cards shrink as they leave the centre, like a stack of physical cards, and the centred one becomes current.
  let queued = false;
  const depth = () => {
    queued = false;
    const mid = track.scrollLeft + track.clientWidth / 2;
    const dist = cards.map((el) => Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid) / (el.offsetWidth || 1));
    dist.forEach((d, i) => cards[i].style.setProperty('--d', Math.min(1, d).toFixed(3)));
    const best = dist.indexOf(Math.min(...dist));
    if (best !== current) { current = best; sync(); buzz(6); }
  };
  track.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(depth); } }, { passive: true });
  mount(h('div', { class: 'screen home' },
    topRow(),
    journeyHeader(myJourney()),
    h('div', { class: 'carousel-wrap' }, track, h('div', { class: 'dots', 'aria-hidden': 'true' }, dots)),
    start));
  sync();
  requestAnimationFrame(depth);
}

// ---------- 3. Film: where to stand (one looping guide), then pick or record a video, on one screen ----------
/** `file`: start reading this clip straight away (used by "Try this video again"). */
function filmScreen(file = null) {
  // iOS offers "Take Video", "Photo Library" and "Choose File" for a video picker, so one button covers recording too.
  const input = h('input', { type: 'file', accept: 'video/*', style: { display: 'none' } });
  const stage = h('div', { class: 'stage' }, guideSvg());
  const tipsEl = tips();
  const loaderBar = h('div', { class: 'progress-bar' });
  const loader = h('div', { class: 'loader', hidden: true, role: 'status' }, h('div', { class: 'progress-track' }, loaderBar), h('p', {}, 'Reading your video…'));
  const pick = h('button', { class: 'btn', onClick: () => { preloadPose(S.config); input.click(); } }, icon('upload', 20), 'Choose a video');
  const actions = h('div', { class: 'stack' }, pick,
    S.lastFile ? h('button', { class: 'btn ghost', onClick: () => begin(S.lastFile) }, icon('retry', 18), 'Use the last video again') : null, input);
  // Once a clip is picked, a still of its first frame replaces the animation and a progress bar sits under it. The analysis
  // screen keeps the same layout and carries the bar on from here, so the hand-over does not look like a restart.
  const begin = (file) => {
    S.reserve = actions.offsetHeight;
    actions.classList.add('busy');
    tipsEl.hidden = true; loader.hidden = false;
    requestAnimationFrame(() => { loaderBar.style.transform = `scaleX(${READ_SHARE})`; });
    preloadPose(S.config);
    return startUpload(file, (v) => {
      v.addEventListener('loadeddata', () => {
        if (!v.videoWidth || !stage.isConnected) return;
        try {
          const s = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          stage.replaceChildren(c); stage.classList.add('has-video'); v.poster_ = c;
        } catch { /* keep the animation if the frame cannot be read */ }
      }, { once: true });
    }, () => stage.isConnected);
  };
  input.addEventListener('change', () => {
    const f = input.files[0];
    input.value = ''; // so picking the same video again still fires a change event
    if (f) begin(f);
  });
  mount(h('div', { class: 'screen' }, topbar('Film your shot', () => go(moveScreen), true), stage, h('div', { class: 'slot' }, tipsEl, loader), actions));
  if (file) begin(file);
  else setTimeout(() => preloadPose(S.config), 2500); // warm the pose model once the screen has settled, not while you are tapping in
}
const READ_SHARE = 0.1; // the share of the progress bar that "reading the video" takes; analysis fills the rest

/** The three filming checks shown on the film screen. */
const tips = () => h('div', { class: 'tips' }, ['Full body in frame', 'Good light', 'Closer is better'].map((t) => h('span', { class: 'pill' }, icon('check', 14), t)));

/** Read an uploaded file and route it to trim or analysis. Used by the picker and by "try this clip again". */
async function startUpload(file, onVideo, stillHere = () => true) {
  S.lastFile = file;
  let v = null;
  try {
    v = makeVideo(file);
    if (onVideo) onVideo(v);
    await whenReady(v);
    const fps = await measureFps(v);
    if (!stillHere()) return URL.revokeObjectURL(v.src); // the user backed out while the clip was being read
    const fpsCheck = fps ? checkFps(fps, S.config) : null;
    if (fpsCheck && fpsCheck.level === 'block') { URL.revokeObjectURL(v.src); return go(errorScreen, fpsCheck.message); } // wrong orientation or low fps only lower the confidence
    const clip = { video: v, fps, source: 'upload', total: v.duration, poster: v.poster_ };
    if (v.duration > S.config.clipSeconds + 0.3) go(trimScreen, clip); else go(analyzeScreen, { ...clip, start: 0, duration: v.duration });
  } catch (e) { if (v) URL.revokeObjectURL(v.src); if (stillHere()) go(errorScreen, e.message || 'Could not read this video.'); }
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
  let timer = 0;
  const stopPreview = () => { clearInterval(timer); timer = 0; };
  let toAnalysis = false;
  S.cleanup = () => { stopPreview(); v.pause(); if (!toAnalysis) URL.revokeObjectURL(v.src); }; // analysis releases it when done
  const play = h('button', { class: 'btn alt', onClick: () => { stopPreview(); v.currentTime = a; v.play().catch(() => {}); timer = setInterval(() => { if (v.currentTime >= b || v.paused) { v.pause(); stopPreview(); } }, 50); } }, icon('play', 20), 'Preview');
  paint(); v.currentTime = 0;
  mount(h('div', { class: 'screen trim' }, topbar('Pick the shot', () => go(filmScreen)),
    p5(`Choose up to ${MAXW} seconds that include the whole shot: load, jump and release.`), v,
    h('div', { class: 'range' }, h('div', { class: 'track' }), win, ia, ib), h('div', { style: { textAlign: 'center' } }, label),
    h('div', { class: 'spacer' }), h('div', { class: 'stack' }, play,
      h('button', { class: 'btn', onClick: () => { toAnalysis = true; go(analyzeScreen, { ...clip, start: a, duration: b - a }); } }, 'Analyse'))));
}
const p5 = (t) => h('p', {}, t);

// ---------- 6. Analysis ----------
// Same layout as the film screen (picture on top, bar under it) and the bar carries on from where reading the video left it.
async function analyzeScreen(clip) {
  const bar = h('div', { class: 'progress-bar', style: { transform: `scaleX(${READ_SHARE})`, transition: 'none' } });
  const status = h('h2', { class: 'sr', 'data-focus': '', 'aria-live': 'polite' }, 'Analysing your shot');
  const detail = h('p', {}, 'Starting…');
  const warn = clip.fps && checkFps(clip.fps, S.config);
  const still = clip.poster && !(clip.start > 0) ? clip.poster : null; // the frame you just saw stays up; after a trim it would be the wrong moment
  const preview = h('canvas', { style: { display: 'none' }, role: 'img', 'aria-label': 'Live view of the player being tracked' });
  const stage = h('div', { class: `stage${still ? ' has-video' : ''}` }, still || throwSvg(), preview);
  mount(h('div', { class: 'screen' }, h('header', { class: 'topbar' }, status), stage,
    h('div', { class: 'slot' }, h('div', { class: 'loader' }, h('div', { class: 'progress-track', role: 'progressbar', 'aria-label': 'Analysis progress' }, bar), detail)),
    h('div', { style: { height: `${S.reserve || 48}px`, flex: 'none' } }), // the film screen's buttons were here: keep the picture the same size
    warn ? h('div', { class: 'tiny-note' }, icon('alert', 14), warn.message) : null));
  requestAnimationFrame(() => { bar.style.transition = ''; });
  try {
    const out = await runAnalysis({ clip, move: S.move, config: S.config, onStatus: (t) => { detail.textContent = t; }, onPreview: (src, lm) => { // live view of who is being tracked: green box + skeleton
      stage.replaceChildren(preview); stage.classList.add('has-video'); preview.style.display = '';
      preview.width = src.width; preview.height = src.height;
      const ctx = preview.getContext('2d'); ctx.drawImage(src, 0, 0);
      if (lm) drawSkeleton(ctx, lm, { w: src.width, h: src.height, hand: null });
    },
    onProgress: (p, info) => { bar.style.transform = `scaleX(${READ_SHARE + (1 - READ_SHARE) * Math.max(0, Math.min(1, p))})`; if (info) detail.textContent = `Frame ${info.done} of ${info.total}${info.etaSec != null ? ` · ${Math.max(1, Math.round(info.etaSec))}s left` : ''}`; } });
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
      S.lastFile ? h('button', { class: 'btn', onClick: () => go(filmScreen, S.lastFile) }, icon('retry', 22), 'Try this video again') : null,
      h('button', { class: S.lastFile ? 'btn alt' : 'btn', onClick: () => go(filmScreen) }, 'Choose another video'),
      h('button', { class: 'btn ghost', onClick: () => go(moveScreen) }, 'Home'))));
}

// ---------- 7 + 8. Report (+ save) ----------
function reportScreen(result) {
  const jBefore = myJourney();
  const before = store.sessionsFor(S.profile.id, result.move);
  const previous = before.length ? before[before.length - 1].score : null;
  const saved = store.addSession({
    id: store.newId(), ts: result.ts, profileId: S.profile.id, move: result.move, hand: result.hand, score: result.score,
    metrics: Object.fromEntries(Object.entries(result.metrics).map(([id, m]) => [id, { value: m.value, score: m.score, status: m.status }])),
  });
  if (!saved) toast('Could not save (storage full?)');
  const jAfter = saved ? myJourney() : jBefore;
  const events = saved ? milestones(jBefore, jAfter) : {}; // comparing before/after means each moment fires exactly once
  const root = mount(renderReport({ result, move: S.move, profile: S.profile, saved, previous, journey: jAfter, events, actions: {
    onRetry: () => go(filmScreen), onProgress: () => go(progressScreen, S.move), onHome: () => go(moveScreen) } }));
  if (events.big) celebrate(root, celebrationText(events, jAfter));
}

const an = (w) => (/^[AEIOU]/.test(w) ? 'an' : 'a');
/** One celebration, even when several moments land together (the first video is also the first level). */
function celebrationText(ev, j) {
  const r = j.rank;
  const next = r.next ? `${r.toNext} more video${r.toNext === 1 ? '' : 's'} to ${r.next}.` : 'Top of the ladder.';
  if (ev.first) return { title: 'First video!', badge: r.name, line: `You're ${an(r.name)} ${r.name}. ${next}` };
  if (ev.rankUp) return { title: `You're ${an(ev.rankUp.to)} ${ev.rankUp.to}!`, badge: ev.rankUp.to, line: `Up from ${ev.rankUp.from}. ${next}` };
  return { title: '5 videos!', badge: r.name, line: `Five sessions in. ${next}` };
}

// ---------- Journey: level, weekly streak, rest weeks ----------
const myJourney = () => journey(store.activityForProfile(S.profile.id));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Home header: the greeting with the level and streak beside it as one unit. Tap it for the timeline and the weekly strip. */
function journeyHeader(j) {
  const r = j.rank;
  const pill = h('button', { class: 'level-pill', onClick: () => go(levelScreen),
    'aria-label': r.name ? `Level ${r.name}${j.streak ? `, streak ${j.streak}` : ''}. Shows the level timeline.` : 'No level yet. Shows the level timeline.' },
  r.name ? h('b', {}, r.name) : h('b', {}, 'Noobie next'),
  r.name && j.streak ? h('span', { class: 'streak' }, ballFireIcon(20), String(j.streak)) : null);
  return h('div', { class: 'journey' },
    h('div', { class: 'greet' }, h('h1', { 'data-focus': '' }, `Hey ${S.profile.name}.`), pill));
}

/** Videos per week for the last 8 weeks; rest weeks held show as spares at the end. */
function weekRow(j) {
  const bar = (w) => h('div', { class: `wk ${w.state}${w.current ? ' now' : ''}` },
    h('span', { class: 'bar' }, w.state === 'rest' ? icon('moon', 12) : h('i', { style: { height: w.count ? `${30 + 70 * (Math.min(PER_WEEK, w.count) / PER_WEEK)}%` : '0' } })));
  const said = j.weeks.map((w) => (w.state === 'rest' ? 'rest' : String(w.count))).join(', ');
  return h('div', { class: 'weekrow' },
    h('div', { class: 'weeks', role: 'img', 'aria-label': `Videos per week, last ${j.weeks.length} weeks, oldest first: ${said}. ${plural(j.restHeld, 'rest week')} held.` }, j.weeks.map(bar)),
    j.restHeld ? h('div', { class: 'spares', 'aria-hidden': 'true' }, Array.from({ length: j.restHeld }, () => icon('moon', 14))) : null);
}

/** The level timeline (where you are, what is behind you, what is ahead) with your videos per week above it. */
function levelScreen() {
  const j = myJourney(), r = j.rank;
  const head = r.name
    ? [h('div', { class: 'big' }, r.name),
      r.next ? h('span', { class: 'lbl' }, `${plural(r.toNext, 'video')} to ${r.next}`) : h('span', { class: 'lbl' }, 'Top of the ladder'),
      r.next ? h('div', { class: 'progress-track', role: 'progressbar', 'aria-label': `Progress to ${r.next}`, 'aria-valuenow': String(Math.round(r.frac * 100)) }, h('div', { class: 'progress-bar', style: { transform: `scaleX(${r.frac})` } })) : null,
      j.total ? h('div', { class: 'perweek' }, h('span', { class: 'lbl' }, 'Videos per week'), weekRow(j)) : null]
    : [h('div', { class: 'big' }, 'Not yet'), h('span', { class: 'lbl' }, 'Film a shot to become a Noobie')];
  const timeline = h('ol', { class: 'timeline' }, LADDER.map((l, i) => h('li', { class: i < r.index ? 'done' : i === r.index ? 'now' : '' },
    h('span', { class: 'node' }, i < r.index ? icon('check', 14) : i === r.index ? icon('ball', 16) : null),
    h('b', {}, l.name), h('span', {}, plural(l.at, 'video')))));
  mount(h('div', { class: 'screen' }, topbar('Your level', () => go(moveScreen)), h('div', { class: 'hero-stat' }, head), timeline));
}

// ---------- 10. Progress ----------
function deltaBadge(dt, suffix = '') {
  if (dt == null) return h('span', {});
  const up = dt > 0, down = dt < 0;
  return h('span', { class: `delta ${up ? 'up' : down ? 'down' : ''}` }, up ? icon('up', 16) : down ? icon('down', 16) : icon('dash', 16), `${up ? '+' : down ? '\u2212' : ''}${Math.abs(dt)}${suffix}`);
}

/** One button wipes every entry. It asks for a second tap (it cannot be undone) instead of opening a dialog. */
function clearAllButton(move) {
  let armed = 0;
  const label = (t) => btn.replaceChildren(icon('trash', 18), t);
  const btn = h('button', { class: 'btn ghost danger', onClick: () => {
    if (!armed) { label('Tap again to delete all scores (level and streak stay)'); armed = setTimeout(() => { armed = 0; label('Clear all entries'); }, 4000); return; }
    clearTimeout(armed);
    if (!store.clearSessions(S.profile.id, move.id)) return toast('Could not clear (storage problem)');
    buzz(15); toast('All entries cleared'); go(progressScreen, move);
  } });
  label('Clear all entries');
  return btn;
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
      h('div', { class: 'stack' }, rows),
      clearAllButton(move)]
      : [h('div', { class: 'panel stack' }, h('h2', {}, 'No sessions yet'), p5(`Film your first ${move.name.toLowerCase()} clip to start tracking.`), h('button', { class: 'btn', onClick: () => { S.move = move; go(filmScreen); } }, icon('camera', 22), 'Film a shot'))]));
}

// ---------- boot ----------
document.addEventListener('touchstart', () => {}, { passive: true }); // lets iOS Safari react the instant a finger lands
initPress();
window.__swishBooted = true; // index.html shows a reload prompt if the app code never gets this far
(async function boot() {
  try { S.config = await store.loadConfig(); } catch { mount(h('div', { class: 'screen' }, h('h1', {}, 'Offline'), p5('Could not load settings. Open Swish once with a connection.'))); return; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const me = store.listProfiles().find((p) => p.id === store.lastProfileId()) || store.listProfiles()[0];
  if (me) { S.profile = me; moveScreen(); } else profileScreen();
})();
