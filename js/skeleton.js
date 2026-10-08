// Draw a pose skeleton over a key frame; the shooting arm and hand are highlighted.
import { LM } from './mathutil.js';
import { token } from './tokens.js';

const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
  [11, 13], [13, 15], [12, 14], [14, 16], [15, 19], [16, 20]];

/** Green rectangle around the tracked person so it is obvious who is being analysed. */
export function drawPlayerBox(ctx, lm, { w, h, label = true }) {
  const pts = lm.filter((p) => p && (p.v ?? 1) > 0.3);
  if (pts.length < 8) return;
  const pad = 0.04;
  const x0 = Math.max(0, Math.min(...pts.map((p) => p.x)) - pad) * w, x1 = Math.min(1, Math.max(...pts.map((p) => p.x)) + pad) * w;
  const y0 = Math.max(0, Math.min(...pts.map((p) => p.y)) - pad) * h, y1 = Math.min(1, Math.max(...pts.map((p) => p.y)) + pad) * h;
  const lw = Math.max(4, w / 100);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = lw * 2.4; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); // dark casing so the box reads on any background
  ctx.strokeStyle = token('--good'); ctx.lineWidth = lw;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  if (label) {
    const fs = Math.max(12, w / 28);
    ctx.font = `800 ${fs}px ${token('--font')}`;
    const tw = ctx.measureText('PLAYER').width + fs * 0.9;
    const lx = Math.max(0, Math.min(w - tw, x0 - lw / 2)), ly = Math.max(0, y0 - fs * 1.5);
    ctx.fillStyle = token('--good'); ctx.fillRect(lx, ly, tw, fs * 1.5);
    ctx.fillStyle = token('--ink'); ctx.textBaseline = 'middle';
    ctx.fillText('PLAYER', lx + fs * 0.45, ly + fs * 0.75);
  }
  ctx.restore();
}

export function drawSkeleton(ctx, lm, { w, h, hand, highlight = null, box = true }) {
  if (!lm) return;
  if (box) drawPlayerBox(ctx, lm, { w, h });
  const P = (i) => ({ x: lm[i].x * w, y: lm[i].y * h, v: lm[i].v ?? 1 });
  const armSet = hand === 'right' ? new Set([12, 14, 16, 20]) : hand === 'left' ? new Set([11, 13, 15, 19]) : new Set(); // no hand yet = no highlight
  const lw = Math.max(4, w / 100);
  const minV = (i) => (i >= 23 ? 0.12 : 0.3); // hips, knees and feet are often low-confidence but still worth showing: aim for a full-body skeleton
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    const pa = P(a), pb = P(b);
    if (pa.v < minV(a) || pb.v < minV(b)) continue;
    const hot = hand === 'right' ? [[12, 14], [14, 16], [16, 20]] : hand === 'left' ? [[11, 13], [13, 15], [15, 19]] : [];
    const isHot = hot.some(([x, y]) => x === a && y === b);
    ctx.strokeStyle = isHot ? token('--hot') : 'rgba(255,255,255,.85)';
    ctx.lineWidth = isHot ? lw * 1.4 : lw;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28]) {
    const p = P(i); if (p.v < minV(i)) continue;
    ctx.fillStyle = armSet.has(i) ? token('--hot') : '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, lw * (armSet.has(i) ? 1.4 : 1.1), 0, Math.PI * 2); ctx.fill();
  }
  if (highlight != null && lm[highlight]) {
    const p = P(highlight);
    ctx.strokeStyle = token('--warn'); ctx.lineWidth = lw * 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, lw * 5, 0, Math.PI * 2); ctx.stroke();
  }
}

/** Which joint to ring for each shooting metric. */
export function focusJoint(metricId, hand) {
  const r = hand === 'right';
  return ({
    releaseAngle: r ? LM.rWrist : LM.lWrist, forwardDrift: LM.rHip, elbowAngle: r ? LM.rElbow : LM.lElbow,
    kneeDip: LM.rKnee, elbowAlignment: r ? LM.rElbow : LM.lElbow, releaseHeight: r ? LM.rWrist : LM.lWrist,
    followThrough: r ? LM.rIndex : LM.lIndex, tempo: LM.rHip, guideHand: r ? LM.lWrist : LM.rWrist,
  })[metricId];
}
