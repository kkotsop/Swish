// Design tokens for canvas and SVG, which cannot read CSS variables directly. styles.css is the single source.
const cache = {};
export function token(name) {
  if (!cache[name]) cache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return cache[name];
}
export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
