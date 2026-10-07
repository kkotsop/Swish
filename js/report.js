// Stories-style report you swipe up/down through.
import { h, buzz } from './ui.js';
import { drawSkeleton, focusJoint } from './skeleton.js';
import { icon, STATUS_ICON } from './icons.js';
import { spring, project, rubberband } from './motion.js';
import { reducedMotion } from './tokens.js';
import { scoreBand } from './coaching.js';

const STATUS_LABEL = { good: 'Good', borderline: 'Borderline', 'needs-work': 'Needs improvement', unknown: 'Not measured' };
const CONF_WORD = { high: 'High', medium: 'Medium', low: 'Low' };
const VIEW_LABEL = { side: 'Side view', front: 'Front view' };
const badge = (status, big = false) => h('span', { class: `flag ${status}${big ? ' big' : ''}` }, icon(STATUS_ICON[status] || 'dash', 14), STATUS_LABEL[status]);
const confBars = (c) => h('span', { class: `conf ${c}`, role: 'img', 'aria-label': `${CONF_WORD[c]} tracking confidence`, title: `${CONF_WORD[c]} tracking confidence` }, h('i'), h('i'), h('i'));
const factsBlock = (m, r) => h('div', { class: 'facts rise' }, h('div', { class: 'fact' }, h('span', {}, 'You'), h('b', {}, fmtValue(m) + (m.unit === 'deg' || m.unit === 's' ? '' : unitNote(m)))),
  h('div', { class: 'fact' }, h('span', {}, 'Target'), h('b', {}, targetText(m, r))), h('span', { class: 'conf-note' }, `${CONF_WORD[m.confidence]} tracking confidence`));

export function fmtValue(m) {
  const v = m.value;
  if (!Number.isFinite(v)) return '—';
  if (m.unit === 'deg') return `${v.toFixed(0)}°`;
  if (m.unit === 's') return `${v.toFixed(2)}s`;
  if (m.unit === 'shins' || m.unit === 'shoulders') return v.toFixed(2);
  if (m.unit === 'forearms') return v.toFixed(1);
  return v.toFixed(2);
}
const unitNote = (m) => ({ shins: ' shins', shoulders: ' shoulders', forearms: ' forearms', 'x height': '× height' })[m.unit] || '';
const unitSym = (m) => ({ deg: '°', s: 's' })[m.unit] || '';

/** Where your number falls against the target: five zones (red, amber, green, amber, red) with a marker. */
const marks = []; // markers to place when their slide arrives
function zoneBar(m, r) {
  if (!Number.isFinite(m.value) || !r) return null;
  const [lo, hi] = r.good, t = r.tolerance;
  const min = lo <= 0 ? 0 : lo - 2 * t, max = hi + 2 * t;
  const cut = [min, lo - t, lo, hi, hi + t, max].map((v) => Math.max(min, Math.min(max, v)));
  const kinds = ['needs-work', 'borderline', 'good', 'borderline', 'needs-work'];
  const segs = kinds.map((k, i) => ({ k, w: cut[i + 1] - cut[i] })).filter((x) => x.w > 1e-9);
  const pos = Math.max(0, Math.min(1, (m.value - min) / (max - min)));
  const track = h('div', { class: 'track' }, segs.map((x) => h('i', { class: `seg ${x.k}${x.k === m.status ? ' on' : ''}`, style: { flexBasis: `${(x.w / (max - min)) * 100}%` } })));
  const mark = h('i', { class: 'mark pop' });
  const tick = (v) => h('span', { style: { left: `${((v - min) / (max - min)) * 100}%` } }, String(Math.round(v * 100) / 100));
  const bar = h('div', { class: 'meter zones wide rise', role: 'img', 'aria-label': `Your number against the target zone: ${STATUS_LABEL[m.status]}.` },
    h('div', { class: 'mrail' }, track, mark),
    h('div', { class: 'ticks', 'aria-hidden': 'true' }, lo > 0 ? tick(lo) : null, tick(hi)));
  marks.push({ mark, track, pos });
  return bar;
}

/** "45–55°" or "under 0.25 shins". */
export function targetText(m, r) {
  const [lo, hi] = r.good, u = unitSym(m), note = unitNote(m);
  return lo <= 0 ? `under ${hi}${u}${note}` : `${lo}–${hi}${u}${note}`;
}

/** Normalised box around the tracked player across the given landmark sets, with generous room for background and the whole body. */
function playerBox(lms) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const lm of lms) for (const [i, p] of (lm || []).entries()) {
    if (!p || (p.v ?? 1) < (i >= 23 ? 0.15 : 0.3)) continue; // keep hips, knees and feet even when tracking is weaker there
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w: 1, h: 1 };
  const w = x1 - x0, h = y1 - y0;
  x0 = Math.max(0, x0 - w * 0.45); x1 = Math.min(1, x1 + w * 0.45); // room on the sides for the shot and the surroundings
  y0 = Math.max(0, y0 - h * 0.18); y1 = Math.min(1, y1 + h * 0.12); // headroom above, floor below the feet
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Widen the box to at least 4:5 (never a narrow strip), staying inside the frame. */
function fitAspect(box, sw, sh, minAspect = 0.8) {
  let w = box.w * sw, hgt = box.h * sh, x = box.x * sw, y = box.y * sh;
  if (w / hgt < minAspect) {
    const nw = Math.min(sw, hgt * minAspect), cx = x + w / 2;
    x = Math.max(0, Math.min(sw - nw, cx - nw / 2)); w = nw;
    if (w / hgt < minAspect) { const nh = w / minAspect, cy = y + hgt / 2; y = Math.max(0, Math.min(sh - nh, cy - nh / 2)); hgt = nh; } // frame too narrow: trim height instead
  }
  return { x, y, w, h: hgt };
}

/** Draw the frame with its overlay, then show the player-centred crop. */
const scratch = document.createElement('canvas');
function paintCropped(canvas, img, lm, box, { hand, highlight = null, dim = 0 }) {
  const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  if (scratch.width !== sw || scratch.height !== sh) { scratch.width = sw; scratch.height = sh; }
  const g = scratch.getContext('2d');
  g.drawImage(img, 0, 0, sw, sh);
  if (dim) { g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, sw, sh); }
  drawSkeleton(g, lm, { w: sw, h: sh, hand, highlight });
  const c = fitAspect(box, sw, sh);
  if (canvas.width !== Math.round(c.w) || canvas.height !== Math.round(c.h)) { canvas.width = Math.round(c.w); canvas.height = Math.round(c.h); }
  canvas.getContext('2d').drawImage(scratch, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
}

function frameCanvas(still, { hand, metricId, onInfo }) {
  const wrap = h('div', { class: 'frame-wrap rise pop' });
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Key frame of your shot with the tracked joints drawn on' });
  wrap.append(canvas);
  if (onInfo) wrap.append(h('button', { class: 'rail', onClick: onInfo, 'aria-label': 'About this metric' }, icon('info', 24)));
  const img = new Image();
  const box = playerBox([still.lm]);
  img.onload = () => paintCropped(canvas, img, still.lm, box, { hand, highlight: focusJoint(metricId, hand), dim: 0.12 });
  img.src = still.src;
  return wrap;
}

/** A looping, GIF-like replay of the tracked shot, cropped to the player (green box + skeleton on every frame). */
function replayCard(result) {
  const { frames, fps } = result.replay;
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Replay of your shot with the tracked player' });
  const wrap = h('div', { class: 'frame-wrap rise pop' }, canvas);
  const imgs = frames.map((f) => { const im = new Image(); im.src = f.src; return im; });
  const box = playerBox(frames.map((f) => f.lm)); // one fixed crop for the whole loop so the view does not jump
  let seen = false;
  const t0 = performance.now();
  const tick = () => {
    if (canvas.isConnected) seen = true; else if (seen) return;
    const i = Math.floor(((performance.now() - t0) / 1000) * fps) % imgs.length;
    const im = imgs[i];
    if (im.complete && im.naturalWidth) paintCropped(canvas, im, frames[i].lm, box, { hand: result.hand });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return wrap;
}

/** Bottom sheet: springs in from the bottom, follows the finger 1:1, and flicks away along the same path it came from. */
export function showMetricSheet(root, { move, id, result }) {
  const copy = move.copy[id], m = result.metrics[id], r = result.ranges[id];
  const opener = document.activeElement;
  let y = 0, anim = null, drag = null, closing = false;
  const height = () => sheet.getBoundingClientRect().height;
  const setY = (v) => { // sheet and scrim move together
    y = v; sheet.style.transform = `translateY(${v}px)`;
    bg.style.background = `rgba(0,0,0,${(0.6 * Math.max(0, 1 - Math.max(0, v) / (height() || 1))).toFixed(3)})`;
  };
  const finish = () => { bg.remove(); document.removeEventListener('keydown', onKey); if (opener && opener.focus) opener.focus(); };
  const dismiss = (velocity = 0) => {
    if (closing) return; closing = true;
    if (anim) anim.cancel();
    if (reducedMotion()) return finish();
    anim = spring({ from: y, to: height(), velocity, response: 0.3, damping: 1, onUpdate: setY, onDone: finish });
  };
  const onKey = (e) => { if (e.key === 'Escape') dismiss(); };

  const closeBtn = h('button', { class: 'back', onClick: () => dismiss(), 'aria-label': 'Close' }, icon('close'));
  const zone = h('div', { class: 'zone' }, h('div', { class: 'grab' }), h('div', { class: 'head' }, h('h3', {}, copy.name), closeBtn));
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': copy.name },
    zone,
    h('div', { class: 'status-line' }, badge(m.status), h('span', {}, `${m.score}/100`)),
    h('div', { class: 'facts' }, h('div', { class: 'fact' }, h('span', {}, 'You'), h('b', {}, fmtValue(m) + (m.unit === 'deg' || m.unit === 's' ? '' : unitNote(m)))),
      h('div', { class: 'fact' }, h('span', {}, 'Target'), h('b', {}, targetText(m, r))),
      h('span', { class: 'conf-note' }, `${CONF_WORD[m.confidence]} tracking confidence`)),
    h('h4', {}, 'What it measures'), h('p', {}, copy.what),
    h('h4', {}, 'Why it matters'), h('p', {}, copy.why),
    h('h4', {}, 'How to improve'), h('p', {}, result.advice[id]),
    h('div', { style: { height: '8px' } }),
    h('button', { class: 'btn alt', onClick: () => dismiss() }, 'Done'));
  const bg = h('div', { class: 'sheet-bg', onClick: (e) => { if (e.target === bg) dismiss(); } }, sheet);

  // Direct manipulation: track from where the finger grabbed, keep a short history for release velocity.
  zone.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || closing) return;
    if (anim) anim.cancel(); // grabbing mid-flight interrupts the animation and continues from the live position
    zone.setPointerCapture(e.pointerId);
    drag = { y0: e.clientY, start: y, hist: [{ t: e.timeStamp, y: e.clientY }] };
  });
  zone.addEventListener('pointermove', (e) => {
    if (!drag) return;
    let ny = drag.start + (e.clientY - drag.y0);
    if (ny < 0) ny = -rubberband(-ny, height()); // soft edge pulling up
    setY(ny);
    drag.hist.push({ t: e.timeStamp, y: e.clientY });
    while (drag.hist.length > 2 && e.timeStamp - drag.hist[0].t > 100) drag.hist.shift();
  });
  const release = (e) => {
    if (!drag) return;
    const hst = drag.hist, a = hst[0], z = hst[hst.length - 1];
    const v = z.t > a.t ? ((z.y - a.y) / (z.t - a.t)) * 1000 : 0; // px/s, positive = downward
    drag = null;
    if (y + project(v) > height() * 0.5) return dismiss(v); // judged by where the flick is heading, not where it let go
    if (anim) anim.cancel();
    const flicked = Math.abs(v) > 300; // bounce only when the gesture carried momentum
    anim = spring({ from: y, to: 0, velocity: v, response: 0.3, damping: flicked && !reducedMotion() ? 0.8 : 1, onUpdate: setY });
  };
  zone.addEventListener('pointerup', release);
  zone.addEventListener('pointercancel', release);

  document.addEventListener('keydown', onKey);
  root.append(bg);
  setY(height()); // start below the screen, then spring up
  if (reducedMotion()) setY(0); else anim = spring({ from: height(), to: 0, response: 0.35, damping: 1, onUpdate: setY });
  closeBtn.focus();
}

/** Build the whole report. actions: { onRetry, onProgress, onHome } */
export function renderReport({ result, move, profile, actions }) {
  const root = h('div', { class: 'stories' });
  const slides = [];
  const ids = result.metricIds || move.metrics;
  const open = (id) => { buzz(8); showMetricSheet(root, { move, id, result }); };
  const band = scoreBand(result.score); // same cut-offs as the summary text

  // Slide 1: score, quick summary, every metric as a /100 chip.
  const chips = ids.filter((id) => result.metrics[id]).map((id) => {
    const m = result.metrics[id];
    return h('button', { class: `chip ${m.status}`, onClick: () => open(id), 'aria-label': `${move.copy[id].name}, ${m.status === 'unknown' ? 'not measured' : `${m.score} out of 100`}, ${STATUS_LABEL[m.status]}, ${CONF_WORD[m.confidence]} tracking confidence. Opens details.` },
      confBars(m.confidence),
      h('span', { class: 'dot' }, icon(STATUS_ICON[m.status] || 'dash', 18)),
      h('b', {}, move.copy[id].short), h('span', { class: 'val' }, m.status === 'unknown' ? '—' : String(m.score), h('em', {}, '/100')));
  });
  const sm = result.summary;
  // The score owns the slide: one number, its status label, and a band meter showing where it falls and why it carries that label.
  const BANDS = [{ k: 'needs-work', w: 50 }, { k: 'borderline', w: 20 }, { k: 'good', w: 30 }];
  const track = h('div', { class: 'track' }, BANDS.map((b) => h('i', { class: `seg ${b.k}${b.k === band ? ' on' : ''}`, style: { flexBasis: `${b.w}%` } })));
  const mark = h('i', { class: 'mark pop' });
  const meter = h('div', { class: 'meter rise', role: 'img', 'aria-label': `Score ${result.score} out of 100, in the ${STATUS_LABEL[band]} band. Good starts at 70, borderline at 50.` },
    h('div', { class: 'mrail' }, track, mark),
    h('div', { class: 'ticks', 'aria-hidden': 'true' }, h('span', { style: { left: '50%' } }, '50'), h('span', { style: { left: '70%' } }, '70')));
  const hero = h('div', { class: 'hero' },
    h('div', { class: 'score-row rise' }, h('div', { class: 'score', 'data-score': String(result.score), 'aria-label': `Score ${result.score} out of 100` }, '0'), h('div', { class: 'score-max' }, '/100')),
    h('div', { class: 'rise' }, badge(band, true)),
    meter);
  const first = h('section', { class: 'slide', 'aria-label': 'Score' },
    h('div', { class: 'pills rise' }, h('span', { class: 'pill' }, VIEW_LABEL[result.view] || 'Side view'),
      h('span', { class: 'pill' }, result.handAmbiguous ? 'Hand unclear' : `${result.hand === 'right' ? 'Right' : 'Left'} hand`),
      h('span', { class: 'who' }, profile.name)),
    hero,
    sm ? h('div', { class: 'summary rise' }, h('b', {}, sm.meaning), h('span', {}, icon('check', 18), sm.works), h('span', {}, icon('up', 18), sm.next)) : null,
    h('div', { class: 'chips rise' }, chips),
    h('p', { class: 'hint rise' }, 'Tap a card for details · swipe up for more'),
    ...[...(result.warnings || []), result.handAmbiguous ? 'Could not tell which hand you shoot with, so treat arm metrics with care.' : null].filter(Boolean)
      .map((w) => h('div', { class: 'tiny-note rise' }, icon('alert', 14), w)));
  slides.push(first);

  // Slide 2: the tracked replay.
  if (result.replay && result.replay.frames.length > 1) {
    slides.push(h('section', { class: 'slide', 'aria-label': 'Tracked replay' },
      h('span', { class: 'flag good rise' }, icon('check', 14), 'Tracked'),
      replayCard(result),
      h('div', { class: 'cap rise' }, 'Your shot, tracked'),
      h('p', { class: 'why rise' }, 'Green box: the player we tracked. Pink: your shooting arm. Wrong person? Record again with just you in frame.')));
  }

  // Issue slides: one per flagged metric, worst first.
  const flagged = ids.filter((id) => result.metrics[id] && result.metrics[id].status !== 'good').sort((a, b) => result.metrics[a].score - result.metrics[b].score);
  for (const id of flagged) {
    const m = result.metrics[id], c = move.copy[id], r = result.ranges[id];
    slides.push(h('section', { class: 'slide', 'aria-label': c.name },
      h('div', { class: 'rise' }, badge(m.status)),
      result.stills[m.frame] ? frameCanvas(result.stills[m.frame], { hand: result.hand, metricId: id, onInfo: () => open(id) }) : null,
      h('div', { class: 'cap rise' }, c.name, m.status === 'unknown' ? '' : ` · ${m.score}/100`),
      factsBlock(m, r), zoneBar(m, r),
      h('h4', { class: 'rise' }, 'How to improve'), h('p', { class: 'fix rise' }, result.advice[id]),
      h('h4', { class: 'rise' }, 'Why it matters'), h('p', { class: 'why rise' }, c.why)));
  }
  if (!flagged.length) {
    const m = result.metrics[ids[0]] || Object.values(result.metrics)[0];
    slides.push(h('section', { class: 'slide', 'aria-label': 'Clean form' },
      h('div', { class: 'rise' }, badge('good')),
      result.stills[m.frame] ? frameCanvas(result.stills[m.frame], { hand: result.hand, metricId: m.id }) : null,
      h('div', { class: 'cap rise' }, 'Clean form'),
      h('p', { class: 'fix rise' }, 'Everything is in the good zone. Film a few more shots to check it holds.')));
  }

  // Final slide: wrap-up actions.
  slides.push(h('section', { class: 'slide', 'aria-label': 'Saved', style: { justifyContent: 'center' } },
    h('div', { class: 'cap rise' }, `Saved. Score ${result.score}.`),
    h('p', { class: 'rise' }, 'The video was not stored.'),
    h('button', { class: 'btn rise', onClick: actions.onRetry }, icon('camera', 22), 'Record another'),
    h('button', { class: 'btn alt rise', onClick: actions.onProgress }, icon('chart', 22), 'See progress'),
    h('button', { class: 'btn ghost rise', onClick: actions.onHome }, 'Home')));

  // Stagger the entrance of each element on a slide.
  for (const s of slides) {
    [...s.querySelectorAll('.rise')].forEach((el, i) => el.style.setProperty('--d', `${i * 70}ms`));
    [...s.children].forEach((el, i) => el.style.setProperty('--i', String(i))); // depth for the scroll cascade
  }

  const bars = h('div', { class: 'bars', 'aria-hidden': 'true' }, slides.map(() => h('i'))); // one segment per slide; swipe up/down to move
  const scroller = h('div', { class: 'scroller', tabindex: '0', 'aria-label': 'Report, swipe or scroll for more' }, slides);
  const closeX = h('button', { class: 'story-x', onClick: actions.onHome, 'aria-label': 'Close report' }, icon('close', 26));

  const countUp = () => {
    const el = first.querySelector('.score'), target = +el.dataset.score, t0 = performance.now();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = String(target); return; }
    const step = (t) => {
      const u = Math.min(1, (t - t0) / 800);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - u, 3))));
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const placeMark = () => { mark.style.transform = `translateX(${(Math.max(0, Math.min(100, result.score)) / 100) * track.clientWidth - 2}px)`; };
  const placeZone = (slide) => marks.filter((z) => slide.contains(z.mark)).forEach((z) => { z.mark.style.transform = `translateX(${z.pos * z.track.clientWidth - 2}px)`; });
  const activate = (slide) => {
    if (slide.classList.contains('active')) return;
    slide.classList.add('active');
    if (slide === first) { countUp(); requestAnimationFrame(placeMark); if (result.score >= 70) buzz(25); }
    requestAnimationFrame(() => placeZone(slide));
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) activate(e.target); }), { root: scroller, threshold: 0.5 });
    slides.forEach((s) => io.observe(s));
  } else slides.forEach(activate);

  const sync = () => {
    const i = Math.max(0, Math.min(slides.length - 1, Math.round(scroller.scrollTop / scroller.clientHeight)));
    [...bars.children].forEach((b, j) => { b.className = j < i ? 'done' : j === i ? 'on' : ''; });
  };
  // Telegram-style scroll feel: every slide reports how far it is from centre, and its children travel at staggered speeds
  // (lower elements trail further), shrinking and dimming as they leave and settling as they arrive.
  let ticking = false;
  const cascade = () => {
    ticking = false;
    const H = scroller.clientHeight || 1, st = scroller.scrollTop;
    slides.forEach((sl) => {
      const p = Math.max(-1, Math.min(1, (sl.offsetTop - st) / H));
      sl.style.setProperty('--p', p.toFixed(3)); sl.style.setProperty('--ap', Math.abs(p).toFixed(3));
    });
  };
  const onScroll = () => { sync(); if (!ticking && !reducedMotion()) { ticking = true; requestAnimationFrame(cascade); } };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  root.append(scroller, bars, closeX);
  requestAnimationFrame(sync);
  return root;
}
