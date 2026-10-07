// Design tokens for canvas and SVG, which cannot read CSS variables directly. styles.css is the single source.
const cache = {};
export function token(name) {
  if (!cache[name]) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return v; // stylesheet not applied yet: do not cache the empty value
    cache[name] = v;
  }
  return cache[name];
}
export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
