// Tiny DOM helpers.
import { icon } from './icons.js';

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
export const $app = () => document.getElementById('app');

/** Swap the screen and move focus to its heading so keyboard and screen-reader users land on the new content. */
export function mount(node) {
  const a = $app();
  a.replaceChildren(node);
  a.classList.toggle('soft', !node.classList.contains('home')); // the court photo is sharp on home and softened everywhere else
  const target = node.querySelector('[data-focus], h1, h2') || node;
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return node;
}
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
export const buzz = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* not supported on iOS Safari */ } };
export function topbar(title, onBack) {
  return h('header', { class: 'topbar' }, onBack ? h('button', { class: 'back', onClick: onBack, 'aria-label': 'Back' }, icon('back')) : null, h('h2', { 'data-focus': '' }, title));
}
export function initials(name) { return (name || '?').trim().slice(0, 1).toUpperCase(); }
export function avatar(profile, size) {
  const a = h('div', { class: 'avatar', style: size ? { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px' } : null });
  if (profile.photo) a.append(h('img', { src: profile.photo, alt: '' })); else a.textContent = initials(profile.name);
  return a;
}
