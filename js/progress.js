// Per-move progress charts (inline SVG, no libraries).
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

/** points: [{ ts, v }] with v in 0..100. */
export function lineChart(points, { color = '#ff6a1a', height = 120, label = true } = {}) {
  const W = 320, H = height, pad = 14;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', preserveAspectRatio: 'none' });
  for (const g of [0, 50, 100]) {
    const y = pad + (1 - g / 100) * (H - 2 * pad);
    svg.append(el('line', { x1: 0, x2: W, y1: y, y2: y, stroke: '#2a2a36', 'stroke-width': 1 }));
  }
  if (!points.length) return svg;
  const x = (i) => (points.length === 1 ? W / 2 : pad + (i / (points.length - 1)) * (W - 2 * pad));
  const y = (v) => pad + (1 - v / 100) * (H - 2 * pad);
  if (points.length > 1) svg.append(el('polyline', { points: points.map((p, i) => `${x(i)},${y(p.v)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  points.forEach((p, i) => svg.append(el('circle', { cx: x(i), cy: y(p.v), r: i === points.length - 1 ? 5 : 3, fill: color })));
  if (label) {
    const last = points[points.length - 1];
    const t = el('text', { x: Math.min(W - 24, x(points.length - 1) + 8), y: Math.max(12, y(last.v) - 8), fill: '#fff', 'font-size': 13, 'font-weight': 900 });
    t.textContent = Math.round(last.v);
    svg.append(t);
  }
  return svg;
}

export function trend(points) {
  if (points.length < 2) return null;
  return points[points.length - 1].v - points[points.length - 2].v;
}
