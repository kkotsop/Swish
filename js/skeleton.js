// Draw a pose skeleton over a key frame; the shooting arm and hand are highlighted.
import { LM } from './mathutil.js';

const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
  [11, 13], [13, 15], [12, 14], [14, 16], [15, 19], [16, 20]];

export function drawSkeleton(ctx, lm, { w, h, hand, highlight = null }) {
  if (!lm) return;
  const P = (i) => ({ x: lm[i].x * w, y: lm[i].y * h, v: lm[i].v ?? 1 });
  const armSet = hand === 'right' ? new Set([12, 14, 16, 20]) : new Set([11, 13, 15, 19]);
  const lw = Math.max(3, w / 120);
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    const pa = P(a), pb = P(b);
    if (pa.v < 0.3 || pb.v < 0.3) continue;
    const hot = hand === 'right' ? [[12, 14], [14, 16], [16, 20]] : [[11, 13], [13, 15], [15, 19]];
    const isHot = hot.some(([x, y]) => x === a && y === b);
    ctx.strokeStyle = isHot ? '#ff3d8b' : 'rgba(255,255,255,.85)';
    ctx.lineWidth = isHot ? lw * 1.9 : lw;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28]) {
    const p = P(i); if (p.v < 0.3) continue;
    ctx.fillStyle = armSet.has(i) ? '#ff3d8b' : '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, lw * (armSet.has(i) ? 1.7 : 1.2), 0, Math.PI * 2); ctx.fill();
  }
  if (highlight != null && lm[highlight]) {
    const p = P(highlight);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = lw * 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, lw * 5, 0, Math.PI * 2); ctx.stroke();
  }
}

/** Which joint to ring for each shooting metric. */
export function focusJoint(metricId, hand) {
  const r = hand === 'right';
  return ({
    releaseAngle: r ? LM.rWrist : LM.lWrist, forwardDrift: LM.rHip, elbowAngle: r ? LM.rElbow : LM.lElbow,
    kneeDip: LM.rKnee, elbowAlignment: r ? LM.rElbow : LM.lElbow, releaseHeight: r ? LM.rWrist : LM.lWrist,
    followThrough: r ? LM.rIndex : LM.lIndex, tempo: LM.rHip,
  })[metricId];
}
