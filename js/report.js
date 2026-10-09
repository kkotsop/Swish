// Stories-style report you swipe up/down through.
import { h, buzz } from './ui.js';
import { drawSkeleton, focusJoint } from './skeleton.js';
import { icon, STATUS_ICON } from './icons.js';
import { reducedMotion } from './tokens.js';
import { scoreBand, CATEGORIES } from './coaching.js';
import { playerBox, fitAspect } from './crop.js';

const STATUS_LABEL = { good: 'Good', borderline: 'Borderline', 'needs-work': 'Needs improvement', unknown: 'Not measured' };
const CONF_WORD = { high: 'High', medium: 'Medium', low: 'Low' };
const VIEW_LABEL = { side: 'Side view', front: 'Front view' };
const badge = (status, big = false) => h('span', { class: `flag ${status}${big ? ' big' : ''}` }, icon(STATUS_ICON[status] || 'dash', 14), STATUS_LABEL[status]);
const confBars = (c) => h('span', { class: `conf ${c}`, role: 'img', 'aria-label': `${CONF_WORD[c]} tracking confidence`, title: `${CONF_WORD[c]} tracking confidence` }, h('i'), h('i'), h('i'));
const factsBlock = (m, r) => h('div', { class: 'facts rise' }, h('div', { class: 'fact' }, h('span', {}, 'You'), h('b', {}, fmtValue(m) + (!Number.isFinite(m.value) || m.unit === 'deg' || m.unit === 's' ? '' : unitNote(m)))),
  h('div', { class: 'fact' }, h('span', {}, 'Target'), h('b', {}, targetText(m, r))), h('span', { class: 'conf-note' }, m.status === 'unknown' ? 'Not measured in this clip' : `${CONF_WORD[m.confidence]} tracking confidence`));

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

/** Where your number falls against the target: five zones (red, amber, green, amber, red) with a marker.
 *  `marks` collects the markers so each can slide into place when its slide arrives. */
function zoneBar(m, r, marks) {
  if (!Number.isFinite(m.value) || !r) return null;
  const [lo, hi] = r.good, [tl, th] = Array.isArray(r.tolerance) ? r.tolerance : [r.tolerance, r.tolerance]; // below / above
  const min = lo <= 0 ? 0 : lo - 2 * tl, max = hi + 2 * th;
  const cut = [min, lo - tl, lo, hi, hi + th, max].map((v) => Math.max(min, Math.min(max, v)));
  const kinds = ['needs-work', 'borderline', 'good', 'borderline', 'needs-work'];
  const segs = kinds.map((k, i) => ({ k, w: cut[i + 1] - cut[i] })).filter((x) => x.w > 0.02 * (max - min)); // a sliver (such as the unused 'too steep' end of an open-ended range) is just clutter
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
  if (m.unit === 'deg' && hi >= 90) return `${lo}° or steeper`; // an angle with no upper limit
  return lo <= 0 ? `under ${hi}${u}${note}` : `${lo}–${hi}${u}${note}`;
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

function frameCanvas(still, { hand, metricId }) {
  const wrap = h('div', { class: 'frame-wrap rise pop' });
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Key frame of your shot with the tracked joints drawn on' });
  wrap.append(canvas);
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
  let seen = false, shown = -1, visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(wrap); // no redraws while its slide is off screen
  const t0 = performance.now();
  const tick = () => {
    if (canvas.isConnected) seen = true; else if (seen) return;
    if (!visible) { requestAnimationFrame(tick); return; }
    const i = Math.floor(((performance.now() - t0) / 1000) * fps) % imgs.length;
    const im = imgs[i];
    if (i !== shown && im.complete && im.naturalWidth) { paintCropped(canvas, im, frames[i].lm, box, { hand: result.hand }); shown = i; } // repaint only when the frame changes
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return wrap;
}

/** Plain words for the last page: how it went overall, what is strongest, what to work on. */
function summaryBlock({ result, move, previous }) {
  const ids = (result.metricIds || move.metrics).filter((id) => result.metrics[id] && result.metrics[id].status !== 'unknown');
  const name = (id) => move.copy[id].name.toLowerCase();
  const strong = ids.filter((id) => result.metrics[id].status === 'good').sort((a, b) => result.metrics[b].score - result.metrics[a].score).slice(0, 2).map(name);
  const work = ids.filter((id) => result.metrics[id].status !== 'good').sort((a, b) => result.metrics[a].score - result.metrics[b].score).slice(0, 2).map(name);
  const word = { good: 'Good form', borderline: 'Getting there', 'needs-work': 'Plenty to work on' }[scoreBand(result.score)];
  const diff = previous == null ? null : result.score - previous;
  const head = `${word}${diff == null ? '' : diff === 0 ? ', same as last time' : `, ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} since last time`}.`; // the score itself is already the title above
  return h('div', { class: 'summary rise' }, h('b', {}, head),
    strong.length ? h('span', { class: 'good' }, icon('check', 18), `Strongest: ${strong.join(' and ')}.`) : null,
    work.length ? h('span', { class: 'work' }, icon('up', 18), `Work on: ${work.join(' and ')}.`) : h('span', { class: 'good' }, icon('check', 18), 'Everything is in the green. Film a few more shots to check it holds.'));
}

/** Build the whole report. actions: { onRetry, onProgress, onHome } */
export function renderReport({ result, move, profile, actions, saved = true, previous = null, journey = null, events = {} }) {
  const root = h('div', { class: 'stories' });
  const slides = [], marks = [];
  const ids = result.metricIds || move.metrics;
  const slideOf = {}; // metric id -> its card, so a chip on the score page can jump to it
  const jump = (id) => { buzz(8); const sl = slideOf[id]; if (sl) scroller.scrollTo({ top: sl.offsetTop, behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  const band = scoreBand(result.score);

  // Slide 1: the score and every metric as a /100 chip.
  const chipFor = (id) => {
    const m = result.metrics[id];
    return h('button', { class: `chip ${m.status}`, onClick: () => jump(id), 'aria-label': `${move.copy[id].name}, ${m.status === 'unknown' ? 'not measured' : `${m.score} out of 100`}, ${STATUS_LABEL[m.status]}, ${CONF_WORD[m.confidence]} tracking confidence. Jumps to its card.` },
      confBars(m.confidence),
      h('span', { class: 'dot' }, icon(STATUS_ICON[m.status] || 'dash', 18)),
      h('b', {}, move.copy[id].short), h('span', { class: 'val' }, m.status === 'unknown' ? '—' : String(m.score), h('em', {}, '/100')));
  };
  const present = ids.filter((id) => result.metrics[id]);
  const groups = CATEGORIES.map((c) => ({ ...c, ids: present.filter((id) => move.copy[id].cat === c.id) })).filter((g) => g.ids.length);
  const chips = h('div', { class: 'chipgroups rise' }, groups.map((g) => h('section', { class: 'chipgroup', 'aria-label': g.name },
    h('h3', { class: 'cat' }, g.name), h('div', { class: 'chips' }, g.ids.map(chipFor)))));
  // The score owns the slide: one number, its status label, and a band meter showing where it falls and why it carries that label.
  const BANDS = [{ k: 'needs-work', w: 50 }, { k: 'borderline', w: 20 }, { k: 'good', w: 30 }];
  const track = h('div', { class: 'track' }, BANDS.map((b) => h('i', { class: `seg ${b.k}${b.k === band ? ' on' : ''}`, style: { flexBasis: `${b.w}%` } })));
  const mark = h('i', { class: 'mark pop' });
  const meter = h('div', { class: 'meter rise', role: 'img', 'aria-label': `Score ${result.score} out of 100, in the ${STATUS_LABEL[band]} band. Good starts at 70, borderline at 50.` },
    h('div', { class: 'mrail' }, track, mark),
    h('div', { class: 'ticks', 'aria-hidden': 'true' }, h('span', { style: { left: '50%' } }, '50'), h('span', { style: { left: '70%' } }, '70')));
  const hero = h('div', { class: 'hero' },
    h('div', { class: 'score-row rise' }, h('div', { class: 'score', role: 'img', 'data-score': String(result.score), 'aria-label': `Score ${result.score} out of 100` }, '0'), h('div', { class: 'score-max' }, '/100')),
    h('div', { class: 'rise' }, badge(band, true)),
    meter);
  const first = h('section', { class: 'slide first', 'aria-label': 'Score' },
    h('div', { class: 'pills rise' }, h('span', { class: 'pill' }, VIEW_LABEL[result.view] || 'Side view'),
      h('span', { class: 'pill' }, `${result.hand === 'right' ? 'Right' : 'Left'} hand`), // always the arm drawn in pink
      h('span', { class: 'who' }, profile.name)),
    hero,
    chips,
    ...[...(result.warnings || []), result.handAmbiguous ? `Couldn\u2019t see which hand you shoot with from this angle, so we measured your ${result.hand} arm (pink). Set your shooting hand in your profile to make it certain.` : null].filter(Boolean)
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

  // One slide per metric, worst first, so every metric has its own card (including the ones in the green).
  const catIndex = (id) => CATEGORIES.findIndex((c) => c.id === move.copy[id].cat);
  const ordered = ids.filter((id) => result.metrics[id]).sort((a, b) => catIndex(a) - catIndex(b) || result.metrics[a].score - result.metrics[b].score);
  for (const id of ordered) {
    const m = result.metrics[id], c = move.copy[id], r = result.ranges[id];
    slides.push(slideOf[id] = h('section', { class: 'slide metric', 'aria-label': c.name },
      h('div', { class: 'mcat rise' }, CATEGORIES[catIndex(id)].name),
      h('div', { class: 'mhead rise' }, h('div', { class: 'cap' }, c.name, m.status === 'unknown' ? '' : ` · ${m.score}/100`), badge(m.status)),
      result.stills[m.frame] ? frameCanvas(result.stills[m.frame], { hand: result.hand, metricId: m.status === 'unknown' ? null : id }) : null, // a blank has nothing to point at
      factsBlock(m, r), zoneBar(m, r, marks),
      h('h4', { class: 'rise' }, m.status === 'good' ? 'Keep it up' : 'How to improve'), h('p', { class: 'fix rise' }, result.advice[id]),
      h('h4', { class: 'rise' }, 'Why it matters'), h('p', { class: 'why rise' }, c.why)));
  }

  // Final slide: wrap-up actions.
  slides.push(h('section', { class: 'slide', 'aria-label': 'Saved' },
    h('div', { class: 'final-main' },
      h('div', { class: 'mhead rise' }, h('div', { class: 'cap' }, saved ? `Saved. Score ${result.score}.` : `Score ${result.score}. Not saved.`),
        journey && journey.rank.name ? h('span', { class: 'level-tag' }, icon('ball', 16), journey.rank.name) : null),
      summaryBlock({ result, move, previous }),
      events.restEarned ? h('div', { class: 'jline rise' }, h('span', { class: 'tag' }, icon('moon', 14), 'Rest week earned')) : null,
      h('button', { class: 'btn rise', onClick: actions.onRetry }, icon('camera', 22), 'Film another'),
      h('button', { class: 'btn alt rise', onClick: actions.onProgress }, icon('chart', 22), 'See progress'),
      h('button', { class: 'btn ghost rise', onClick: actions.onHome }, 'Home')),
    h('p', { class: 'footnote rise' }, saved ? 'The video was not stored.' : 'This phone\u2019s storage is full, so this score was not added to your progress. The video was not stored.')));

  // Stagger the entrance of each element on a slide.
  for (const s of slides) {
    [...s.querySelectorAll('.rise')].forEach((el, i) => el.style.setProperty('--d', `${i * 70}ms`));
    [...s.children].forEach((el, i) => el.style.setProperty('--i', String(i))); // depth for the scroll cascade
  }

  const bars = h('div', { class: 'bars', 'aria-hidden': 'true' }, slides.map(() => h('i'))); // one segment per slide; swipe up/down to move
  const scroller = h('div', { class: 'scroller', tabindex: '0', 'aria-label': 'Report, swipe or scroll for more' }, slides);
  const swipeHint = h('div', { class: 'swipe-hint', 'aria-hidden': 'true' }, icon('up', 22), h('span', {}, 'Swipe up'));
  const closeX = h('button', { class: 'story-x', onClick: actions.onHome, 'aria-label': 'Close report' }, icon('close', 26));

  const countUp = () => {
    const el = first.querySelector('.score'), target = +el.dataset.score, t0 = performance.now();
    if (reducedMotion()) { el.textContent = String(target); return; }
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
      const raw = (sl.offsetTop - st) / H;
      if (Math.abs(raw) > 1.5) return; // far off screen: nothing to animate, so no style work while swiping
      const p = Math.max(-1, Math.min(1, raw));
      sl.style.setProperty('--p', p.toFixed(3)); sl.style.setProperty('--ap', Math.abs(p).toFixed(3));
    });
  };
  const onScroll = () => { sync(); swipeHint.style.opacity = String(Math.max(0, 1 - scroller.scrollTop / ((scroller.clientHeight || 1) * 0.3))); // the hint belongs to the score page only
    if (!ticking && !reducedMotion()) { ticking = true; requestAnimationFrame(cascade); } };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  root.append(scroller, bars, swipeHint, closeX);
  requestAnimationFrame(sync);
  return root;
}
