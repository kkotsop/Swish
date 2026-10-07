// Small geometry / signal helpers shared by the analysis code. No DOM access.
export const LM = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lIndex: 19, rIndex: 20, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
};

export const deg = (r) => (r * 180) / Math.PI;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Interior angle at b for points a-b-c, in degrees (0..180). */
export function angleAt(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y];
  const v2 = [c.x - b.x, c.y - b.y];
  const d = Math.hypot(...v1) * Math.hypot(...v2);
  if (!d) return NaN;
  return deg(Math.acos(clamp((v1[0] * v2[0] + v1[1] * v2[1]) / d, -1, 1)));
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Moving average over a numeric series (centered, window n). */
export function smoothSeries(arr, n = 5) {
  const h = n >> 1;
  return arr.map((_, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(arr.length - 1, i + h); j++) {
      if (Number.isFinite(arr[j])) { s += arr[j]; c++; }
    }
    return c ? s / c : NaN;
  });
}

/** Linearly fill NaN gaps in a series (edges copy nearest value). */
export function fillGaps(arr) {
  const out = [...arr];
  let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) {
      if (last >= 0 && i - last > 1) {
        for (let j = last + 1; j < i; j++) out[j] = out[last] + ((out[i] - out[last]) * (j - last)) / (i - last);
      } else if (last < 0) {
        for (let j = 0; j < i; j++) out[j] = out[i];
      }
      last = i;
    }
  }
  if (last >= 0) for (let j = last + 1; j < out.length; j++) out[j] = out[last];
  return out;
}

export const argmin = (a, from = 0, to = a.length - 1) => {
  let bi = -1;
  for (let i = from; i <= to; i++) if (Number.isFinite(a[i]) && (bi < 0 || a[i] < a[bi])) bi = i;
  return bi;
};
export const argmax = (a, from = 0, to = a.length - 1) => {
  let bi = -1;
  for (let i = from; i <= to; i++) if (Number.isFinite(a[i]) && (bi < 0 || a[i] > a[bi])) bi = i;
  return bi;
};
