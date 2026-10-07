// Turn reference-clip metric values into editable ranges: observed range plus a buffer.
import { mean } from './mathutil.js';

/** values: numbers from the reference clips. Returns { good:[lo,hi], tolerance }. */
export function rangeFromValues(values, { bufferFrac = 0.15, minBufferFrac = 0.05 } = {}) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const span = hi - lo;
  const buf = Math.max(span * bufferFrac, Math.abs(mean(v)) * minBufferFrac);
  const round = (x) => Math.round(x * 100) / 100;
  const good = [round(lo - buf), round(hi + buf)];
  return { good, tolerance: round(Math.max((good[1] - good[0]) * 0.5, buf)) };
}

/** perClip: array of { metrics } from analyzeShooting. Returns ranges for every metric id. */
export function rangesFromClips(perClip, ids) {
  const out = {};
  for (const id of ids) out[id] = rangeFromValues(perClip.filter((c) => c && c.ok).map((c) => c.metrics[id].value));
  return out;
}
