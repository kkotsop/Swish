// Stories-style report you swipe up/down through.
import { h, buzz } from './ui.js';
import { drawSkeleton, focusJoint } from './skeleton.js';

const STATUS_LABEL = { good: 'Good', borderline: 'Borderline', 'needs-work': 'Needs work', unknown: 'Not measured' };
const CONF_WORD = { high: 'High', medium: 'Medium', low: 'Low' };
const VIEW_LABEL = { side: 'Side view', front: 'Front view' };

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
const unitSym = (m) => ({ deg: '°', s: 's', 'x height': '×' })[m.unit] || '';

/** "45–55°" or "under 0.25 shins". */
export function targetText(m, r) {
  const [lo, hi] = r.good, u = unitSym(m), note = unitNote(m);
  return lo <= 0 ? `under ${hi}${u}${note}` : `${lo}–${hi}${u}${note}`;
}

function frameCanvas(still, { hand, metricId }) {
  const wrap = h('div', { class: 'frame-wrap rise' });
  const canvas = h('canvas');
  wrap.append(canvas);
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, img.width, img.height);
    drawSkeleton(ctx, still.lm, { w: img.width, h: img.height, hand, highlight: focusJoint(metricId, hand) });
  };
  img.src = still.src;
  return wrap;
}

/** A looping, GIF-like replay of the tracked shot (green player box + skeleton on every frame). */
function replayCard(result) {
  const { frames, fps } = result.replay;
  const canvas = h('canvas', { 'aria-label': 'Replay of your shot with the tracked player' });
  const wrap = h('div', { class: 'frame-wrap rise' }, canvas);
  const imgs = frames.map((f) => { const im = new Image(); im.src = f.src; return im; });
  let seen = false;
  const t0 = performance.now();
  const tick = () => {
    if (canvas.isConnected) seen = true; else if (seen) return;
    const i = Math.floor(((performance.now() - t0) / 1000) * fps) % imgs.length;
    const im = imgs[i];
    if (im.complete && im.naturalWidth) {
      if (canvas.width !== im.naturalWidth) { canvas.width = im.naturalWidth; canvas.height = im.naturalHeight; }
      const ctx = canvas.getContext('2d');
      ctx.drawImage(im, 0, 0);
      drawSkeleton(ctx, frames[i].lm, { w: canvas.width, h: canvas.height, hand: result.hand });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return wrap;
}

export function showMetricSheet(root, { move, id, result }) {
  const copy = move.copy[id], m = result.metrics[id], r = result.ranges[id];
  const close = () => bg.remove();
  const bg = h('div', { class: 'sheet-bg', onClick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'sheet' },
      h('h3', {}, copy.name),
      h('div', { class: 'row' }, h('span', { class: `status-dot ${m.status}` }), h('b', {}, `${m.score}/100 · ${STATUS_LABEL[m.status]}`)),
      h('div', { class: 'facts' }, h('span', {}, 'Your number ', h('b', {}, fmtValue(m) + (m.unit === 'deg' || m.unit === 's' ? '' : unitNote(m)))), h('span', {}, 'Target ', h('b', {}, targetText(m, r))),
        h('span', { class: 'conf-note' }, `${CONF_WORD[m.confidence]} confidence`)),
      h('div', { class: 'k' }, 'What it measures'), h('p', {}, copy.what),
      h('div', { class: 'k' }, 'Why it matters'), h('p', {}, copy.why),
      h('div', { class: 'k' }, 'How to improve'), h('p', {}, result.advice[id]),
      h('div', { style: { height: '14px' } }),
      h('button', { class: 'btn alt', onClick: close }, 'Close')));
  root.append(bg);
}

/** Build the whole report. actions: { onRetry, onProgress, onHome } */
export function renderReport({ result, move, profile, actions }) {
  const root = h('div', { class: 'stories' });
  const slides = [];
  const ids = result.metricIds || move.metrics;
  const open = (id) => { buzz(8); showMetricSheet(root, { move, id, result }); };

  // Slide 1: score, quick summary, every metric as a /100 card.
  const chips = ids.filter((id) => result.metrics[id]).map((id) => {
    const m = result.metrics[id];
    return h('button', { class: `chip ${m.status}`, onClick: () => open(id), 'aria-label': `${move.copy[id].name} ${m.score} out of 100, ${STATUS_LABEL[m.status]}` },
      h('i', { class: `conf ${m.confidence}`, title: `${CONF_WORD[m.confidence]} tracking confidence` }),
      h('b', {}, move.copy[id].short), h('span', {}, m.status === 'unknown' ? '—' : String(m.score), h('em', {}, '/100')), h('small', {}, STATUS_LABEL[m.status]));
  });
  const sm = result.summary;
  const first = h('section', { class: 'slide' },
    h('div', { class: 'row rise' }, h('span', { class: 'pill' }, VIEW_LABEL[result.view] || 'Side view'),
      h('span', { class: 'pill hand' }, result.handAmbiguous ? 'Hand unclear' : `${result.hand === 'right' ? 'Right' : 'Left'} hand`),
      h('span', { class: 'spacer' }), h('span', { class: 'who' }, profile.name)),
    h('div', { class: 'score-row rise' }, h('div', { class: 'score', 'data-score': String(result.score) }, '0'), h('div', { class: 'score-max' }, '/100')),
    sm ? h('div', { class: 'summary rise' }, h('b', {}, sm.meaning), h('span', { class: 'works' }, sm.works), h('span', { class: 'next' }, sm.next)) : null,
    ...(result.warnings || []).map((w) => h('div', { class: 'card rise', style: { borderLeft: '6px solid var(--warn)', padding: '10px 14px' } }, h('b', {}, 'Heads up: '), w)),
    result.handAmbiguous ? h('p', { class: 'rise' }, 'We could not tell for sure which hand is your shooting hand in this clip, so treat the arm metrics with care.') : null,
    h('div', { class: 'chips rise' }, chips),
    h('p', { class: 'hint rise' }, 'Tap a card for details · swipe up for more'));
  slides.push(first);

  // Slide 2: the tracked replay.
  if (result.replay && result.replay.frames.length > 1) {
    slides.push(h('section', { class: 'slide' },
      h('span', { class: 'flag good rise' }, 'Tracked'),
      replayCard(result),
      h('div', { class: 'cap rise' }, 'Your shot, ', h('em', {}, 'tracked')),
      h('p', { class: 'why rise' }, 'The green box is the player we analysed, and the pink arm is your shooting arm. If the box is on the wrong person, record again with just you in the shot.')));
  }

  // Issue slides: one per flagged metric, worst first.
  const flagged = ids.filter((id) => result.metrics[id] && result.metrics[id].status !== 'good').sort((a, b) => result.metrics[a].score - result.metrics[b].score);
  for (const id of flagged) {
    const m = result.metrics[id], c = move.copy[id], r = result.ranges[id];
    slides.push(h('section', { class: 'slide' },
      h('span', { class: `flag ${m.status} rise` }, STATUS_LABEL[m.status]),
      result.stills[m.frame] ? frameCanvas(result.stills[m.frame], { hand: result.hand, metricId: id }) : null,
      h('div', { class: 'cap rise' }, c.name, ' · ', h('em', {}, m.status === 'unknown' ? '—' : `${m.score}/100`)),
      h('div', { class: 'facts rise' }, h('span', {}, 'Your number ', h('b', {}, fmtValue(m) + (m.unit === 'deg' || m.unit === 's' ? '' : unitNote(m)))),
        h('span', {}, 'Target ', h('b', {}, targetText(m, r))), h('span', { class: 'conf-note' }, `${CONF_WORD[m.confidence]} confidence`)),
      h('div', { class: 'k rise' }, 'Why it matters'), h('p', { class: 'why rise' }, c.why),
      h('div', { class: 'k rise' }, 'How to improve'), h('p', { class: 'fix rise' }, result.advice[id])));
  }
  if (!flagged.length) {
    const m = result.metrics[ids[0]] || Object.values(result.metrics)[0];
    slides.push(h('section', { class: 'slide' },
      h('span', { class: 'flag good rise' }, 'Good'),
      result.stills[m.frame] ? frameCanvas(result.stills[m.frame], { hand: result.hand, metricId: m.id }) : null,
      h('div', { class: 'cap rise' }, 'Clean form'),
      h('p', { class: 'fix rise' }, 'Every metric is in the good zone on this clip. Film a few more shots to check it is repeatable.')));
  }

  // Final slide: wrap-up actions.
  slides.push(h('section', { class: 'slide', style: { justifyContent: 'center' } },
    h('div', { class: 'cap rise' }, 'Saved', h('br'), h('em', {}, `Score ${result.score}`)),
    h('p', { class: 'fix rise' }, `Added to ${profile.name}'s ${move.name.toLowerCase()} history. The video was not stored.`),
    h('button', { class: 'btn rise', onClick: actions.onRetry }, 'Record another'),
    h('button', { class: 'btn alt rise', onClick: actions.onProgress }, 'See progress'),
    h('button', { class: 'btn ghost rise', onClick: actions.onHome }, 'Home')));

  // Stagger the entrance of each element on a slide.
  for (const s of slides) [...s.querySelectorAll('.rise')].forEach((el, i) => el.style.setProperty('--d', `${i * 70}ms`));

  const bars = h('div', { class: 'bars' }, slides.map(() => h('i'))); // one segment per slide; swipe up/down to move
  const scroller = h('div', { class: 'scroller' }, slides);

  const countUp = () => {
    const el = first.querySelector('.score'), target = +el.dataset.score, t0 = performance.now();
    const step = (t) => {
      const u = Math.min(1, (t - t0) / 800);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - u, 3))));
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const activate = (slide) => {
    if (slide.classList.contains('active')) return;
    slide.classList.add('active');
    if (slide === first) { countUp(); if (result.score >= 80) buzz(25); }
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) activate(e.target); }), { root: scroller, threshold: 0.5 });
    slides.forEach((s) => io.observe(s));
  } else slides.forEach(activate);

  const sync = () => {
    const i = Math.round(scroller.scrollTop / scroller.clientHeight);
    [...bars.children].forEach((b, j) => { b.className = j < i ? 'done' : j === i ? 'on' : ''; });
  };
  scroller.addEventListener('scroll', sync, { passive: true });
  root.append(bars, scroller);
  requestAnimationFrame(sync);
  return root;
}
