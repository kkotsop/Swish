// The big celebration: a full-screen moment for the first video, the fifth, and every level-up. Rare on purpose, so it
// lands. Tap "Keep going" (or Escape) to carry on to the report underneath.
import { h, buzz } from './ui.js';
import { icon } from './icons.js';
import { reducedMotion } from './tokens.js';

const COLORS = ['var(--good)', 'var(--warn)', 'var(--pink)', 'var(--blue)', '#fff'];

/** root: the element to cover. { title, line, badge } -> removes itself when dismissed. */
export function celebrate(root, { title, line, badge }) {
  const opener = document.activeElement;
  const confetti = reducedMotion() ? null : h('div', { class: 'confetti', 'aria-hidden': 'true' },
    Array.from({ length: 32 }, (_, i) => {
      const p = h('i', { style: { left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 8) * 60}ms`, animationDuration: `${1300 + ((i * 53) % 700)}ms` } });
      p.style.setProperty('--drift', `${((i * 29) % 60) - 30}px`); p.style.setProperty('--spin', `${((i * 71) % 540) - 270}deg`); // custom properties need setProperty
      return p;
    }));
  const btn = h('button', { class: 'btn', onClick: () => close() }, 'Keep going');
  const el = h('div', { class: 'celebrate', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    confetti,
    h('div', { class: 'cel-card' },
      h('div', { class: 'cel-badge' }, icon('ball', 56)),
      badge ? h('span', { class: 'cel-level' }, badge) : null,
      h('h2', {}, title),
      line ? h('p', {}, line) : null,
      btn));
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    el.classList.add('out');
    setTimeout(() => { el.remove(); if (opener && opener.focus) opener.focus({ preventScroll: true }); }, reducedMotion() ? 0 : 220);
  };
  document.addEventListener('keydown', onKey);
  root.append(el);
  btn.focus({ preventScroll: true });
  buzz(30);
  return el;
}
