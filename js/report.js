// Stories-style swipeable report.
import { h, buzz } from './ui.js';
import { drawSkeleton, focusJoint } from './skeleton.js';

const STATUS_LABEL = { good: 'Good', borderline: 'Borderline', 'needs-work': 'Needs work' };
const CONF_LABEL = { high: 'High tracking confidence', medium: 'Medium tracking confidence', low: 'Low tracking confidence. Treat this number with care.' };

export function fmtValue(m) {
  const v = m.value;
  if (m.unit === 'deg') return `${v.toFixed(0)}°`;
  if (m.unit === 's') return `${v.toFixed(2)}s`;
  if (m.unit === 'shins') return `${v.toFixed(2)}`;
  return v.toFixed(2);
}
const unitNote = (m) => (m.unit === 'shins' ? ' shins' : m.unit === 'x height' ? '× height' : '');

function frameCanvas(still, { hand, metricId }) {
  const wrap = h('div', { class: 'frame-wrap' });
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

export function showMetricSheet(root, { move, id, result }) {
  const copy = move.copy[id], m = result.metrics[id], r = result.ranges[id];
  const close = () => bg.remove();
  const bg = h('div', { class: 'sheet-bg', onClick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'sheet' },
      h('h3', {}, copy.name),
      h('div', { class: 'row' }, h('span', { class: `status-dot ${m.status}` }), h('b', {}, `${fmtValue(m)}${unitNote(m)} · ${STATUS_LABEL[m.status]}`)),
      h('div', { class: 'k' }, 'What it measures'), h('p', {}, copy.what),
      h('div', { class: 'k' }, 'Why it matters'), h('p', {}, copy.why),
      h('div', { class: 'k' }, 'How to improve'), h('p', {}, result.advice[id]),
      h('div', { class: 'k' }, 'Target'), h('p', {}, `${r.good[0]} – ${r.good[1]} ${m.unit === 'deg' ? '°' : m.unit === 's' ? 's' : unitNote(m).trim()}`),
      h('div', { class: 'k' }, 'Tracking confidence'), h('p', {}, CONF_LABEL[m.confidence]),
      h('div', { style: { height: '14px' } }),
      h('button', { class: 'btn alt', onClick: close }, 'Close')));
  root.append(bg);
}

/** Build the whole report. actions: { onRetry, onProgress, onHome } */
export function renderReport({ result, move, profile, actions }) {
  const root = h('div', { class: 'stories' });
  const slides = [];
  const ids = move.metrics;
  const open = (id) => { buzz(8); showMetricSheet(root, { move, id, result }); };

  // Slide 1: scorecard with all metrics.
  const chips = ids.map((id, i) => {
    const m = result.metrics[id];
    return h('button', { class: `chip ${m.status}`, style: { animationDelay: `${0.05 * i}s` }, onClick: () => open(id), 'aria-label': `${move.copy[id].name} ${fmtValue(m)} ${STATUS_LABEL[m.status]}` },
      h('i', { class: `conf ${m.confidence}`, title: CONF_LABEL[m.confidence] }),
      h('b', {}, move.copy[id].short), h('span', {}, fmtValue(m)), h('br'), h('small', {}, STATUS_LABEL[m.status]));
  });
  slides.push(h('section', { class: 'slide' },
    h('div', { class: 'row' }, h('span', { class: 'pill' }, move.name), h('span', { class: 'pill hand' }, result.handAmbiguous ? 'Hand unclear' : `${result.hand === 'right' ? 'Right' : 'Left'} hand`), h('span', { class: 'spacer' }), h('span', { class: 'pill' }, profile.name)),
    h('div', { class: 'score-row' }, h('div', { class: 'score' }, String(result.score)), h('p', { style: { margin: '0 0 8px', fontWeight: 800 } }, 'Form score\nout of 100')),
    result.handAmbiguous ? h('p', {}, 'We could not tell for sure which hand is your shooting hand in this clip, so treat the arm metrics with care.') : null,
    h('div', { class: 'chips' }, chips),
    h('p', { style: { textAlign: 'center', marginTop: '4px' } }, 'Tap a card for details · swipe for fixes ›')));

  // Issue slides: one per flagged metric, worst first.
  const flagged = ids.filter((id) => result.metrics[id].status !== 'good').sort((a, b) => result.metrics[a].score - result.metrics[b].score);
  for (const id of flagged) {
    const m = result.metrics[id], c = move.copy[id];
    slides.push(h('section', { class: 'slide' },
      result.stills[m.frame] ? frameCanvas(result.stills[m.frame], { hand: result.hand, metricId: id }) : null,
      h('div', { class: 'cap' }, h('em', {}, STATUS_LABEL[m.status]), h('br'), c.name, ' · ', fmtValue(m)),
      h('p', { class: 'fix' }, result.advice[id]),
      h('button', { class: 'btn alt', onClick: () => open(id) }, 'Why it matters')));
  }
  if (!flagged.length) {
    const m = result.metrics.releaseAngle;
    slides.push(h('section', { class: 'slide' },
      result.stills[m.frame] ? frameCanvas(result.stills[m.frame], { hand: result.hand, metricId: 'releaseAngle' }) : null,
      h('div', { class: 'cap' }, h('em', {}, 'Clean form'), h('br'), 'Nothing to fix'),
      h('p', { class: 'fix' }, 'All eight metrics are in the good zone on this clip. Film a few more shots to check it is repeatable.')));
  }

  // Final slide: wrap-up actions.
  slides.push(h('section', { class: 'slide', style: { justifyContent: 'center' } },
    h('div', { class: 'cap' }, 'Saved', h('br'), h('em', {}, `Score ${result.score}`)),
    h('p', { class: 'fix' }, `Added to ${profile.name}'s ${move.name.toLowerCase()} history. The video was not stored.`),
    h('button', { class: 'btn', onClick: actions.onRetry }, 'Record another'),
    h('button', { class: 'btn alt', onClick: actions.onProgress }, 'See progress'),
    h('button', { class: 'btn ghost', onClick: actions.onHome }, 'Home')));

  const bars = h('div', { class: 'bars' }, slides.map(() => h('i')));
  const scroller = h('div', { class: 'scroller' }, slides);
  const sync = () => {
    const i = Math.round(scroller.scrollLeft / scroller.clientWidth);
    [...bars.children].forEach((b, j) => { b.className = j < i ? 'done' : j === i ? 'on' : ''; });
    if (sync.last !== i) { sync.last = i; if (i === 0 && result.score >= 80) buzz(20); }
  };
  scroller.addEventListener('scroll', sync, { passive: true });
  // Tap left/right edge to navigate.
  scroller.addEventListener('click', (e) => {
    if (e.target.closest('button, .sheet')) return;
    const x = e.clientX / window.innerWidth;
    scroller.scrollBy({ left: (x < 0.25 ? -1 : x > 0.75 ? 1 : 0) * scroller.clientWidth, behavior: 'smooth' });
  });
  root.append(bars, scroller);
  requestAnimationFrame(sync);
  if (result.score >= 80) buzz(25);
  return root;
}
