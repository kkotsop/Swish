// Synthetic side-on shooter used to unit-test the analysis. World units = standing "image heights".
// Image coords: x = wx / aspect, y = wy (y down). Shooter faces +x (or -x if mirror).
export const ASPECT = 9 / 16;
const sstep = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

function legHeight(F, s, t) {
  const f = (F * Math.PI) / 180;
  const phi = Math.atan2(t * Math.sin(f), s + t * Math.cos(f));
  const psi = f - phi;
  return { h: s * Math.cos(phi) + t * Math.cos(psi), kneeFwd: s * Math.sin(phi), kneeUp: s * Math.cos(phi) };
}

function ik(shoulder, target, U, Fa, sign) {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y;
  let d = Math.hypot(dx, dy);
  d = Math.min(d, U + Fa - 1e-6);
  const a = Math.acos(Math.min(1, Math.max(-1, (U * U + d * d - Fa * Fa) / (2 * U * d))));
  const base = Math.atan2(dy, dx);
  const ang = base + sign * a;  // bend downward
  return { x: shoulder.x + U * Math.cos(ang), y: shoulder.y + U * Math.sin(ang) };
}

export function makeShot(opts = {}) {
  const o = {
    fps: 60, seconds: 5, mirror: false, rightHanded: true, kneeFlex: 40, setElbow: 90, setTilt: 5,
    releaseDirDeg: 62, drift: 0.1, jumpHeight: 0.06, dipStart: 1.0, dipEnd: 1.4, riseEnd: 1.65,
    releaseT: 1.75, landT: 2.15, followBeta: 80, releaseReach: 0.28, guideMode: 'near', ...opts,
  };
  const s = 0.12, t = 0.13, torso = 0.17, U = 0.1, Fa = 0.1, y0 = 0.85, x0 = 0.5 * ASPECT;
  const face = o.mirror ? -1 : 1;
  const n = Math.round(o.fps * o.seconds);
  const frames = [], truth = [];
  const setT = o.releaseT - 0.2;
  for (let i = 0; i < n; i++) {
    const tt = i / o.fps;
    let F = 5;
    if (tt >= o.dipStart && tt < o.dipEnd) F = lerp(5, o.kneeFlex, sstep((tt - o.dipStart) / (o.dipEnd - o.dipStart)));
    else if (tt >= o.dipEnd && tt < o.riseEnd) F = lerp(o.kneeFlex, 2, sstep((tt - o.dipEnd) / (o.riseEnd - o.dipEnd)));
    else if (tt >= o.riseEnd) F = 2;
    const leg = legHeight(F, s, t);
    const jt = (tt - o.riseEnd) / (o.landT - o.riseEnd);
    const lift = jt > 0 && jt < 1 ? o.jumpHeight * Math.sin(Math.PI * jt) : 0;
    const dr = o.drift * s * face * sstep(jt);
    const ax = x0 + dr, ay = y0 - lift;
    const hip = { x: ax, y: ay - leg.h };
    const sho = { x: hip.x, y: hip.y - torso };
    const nose = { x: sho.x + 0.02 * face, y: sho.y - 0.09 };
    const knee = { x: ax + leg.kneeFwd * face, y: ay - leg.kneeUp };
    const ankle = { x: ax, y: ay };
    // shooting arm: wrist target path
    const f = (deg) => (deg * Math.PI) / 180;
    // set pose (forward kinematics)
    const E = f(o.setElbow);
    const dFore = { x: Math.sin(f(o.setTilt)) * face, y: -Math.cos(f(o.setTilt)) };
    // elbow->shoulder direction = dFore rotated by E toward the body (backward)
    const th = -face * E, cs = Math.cos(th), sn = Math.sin(th);
    const rot = { x: dFore.x * cs - dFore.y * sn, y: dFore.x * sn + dFore.y * cs };
    const elbowSet = { x: sho.x - U * rot.x * 1, y: sho.y - U * rot.y };
    const wristSet = { x: elbowSet.x + Fa * dFore.x, y: elbowSet.y + Fa * dFore.y };
    const relDir = { x: Math.cos(f(o.releaseDirDeg)) * face, y: -Math.sin(f(o.releaseDirDeg)) };
    const wristRel = { x: sho.x + (U + Fa) * 0.98 * relDir.x, y: sho.y + (U + Fa) * 0.98 * relDir.y };
    const low = { x: sho.x + 0.04 * face, y: sho.y + 0.12 }; // hands low before the shot
    let wrist, elbow;
    if (tt < o.dipEnd) {
      const u = sstep((tt - 0.2) / (o.dipEnd - 0.2));
      wrist = { x: lerp(low.x, wristSet.x, u * 0.0 + (tt > o.dipStart ? sstep((tt - o.dipStart) / (o.dipEnd - o.dipStart)) : 0)), y: lerp(low.y, wristSet.y, tt > o.dipStart ? sstep((tt - o.dipStart) / (o.dipEnd - o.dipStart)) : 0) };
    } else if (tt < setT) wrist = wristSet;
    else if (tt <= o.releaseT) {
      const u = sstep((tt - setT) / (o.releaseT - setT));
      wrist = { x: lerp(wristSet.x, wristRel.x, u), y: lerp(wristSet.y, wristRel.y, u) };
    } else {
      const u = sstep((tt - o.releaseT) / 0.25);
      wrist = { x: lerp(wristRel.x, wristRel.x + 0.03 * face, u), y: lerp(wristRel.y, wristRel.y + 0.06, u) };
    }
    // keep arm attached to the (moving) shoulder
    wrist = { x: wrist.x, y: wrist.y };
    if (tt < setT) { elbow = ik(sho, wrist, U, Fa, face > 0 ? 1 : -1); if (tt >= o.dipEnd) elbow = elbowSet; }
    else elbow = ik(sho, wrist, U, Fa, face > 0 ? 1 : -1);
    const beta = tt > o.releaseT ? lerp(0, o.followBeta, sstep((tt - o.releaseT) / 0.2)) : 0;
    const index = { x: wrist.x + 0.04 * Math.cos(f(beta)) * face, y: wrist.y + 0.04 * Math.sin(f(beta)) };
    const holding = tt >= o.dipEnd && tt <= o.releaseT + 0.03;
    const gWrist = o.guideMode === 'near' && holding
      ? { x: wrist.x - 0.03 * face, y: wrist.y + 0.04 }
      : { x: sho.x + 0.03 * face, y: sho.y + 0.12 };
    const gElbow = { x: sho.x + 0.02 * face, y: sho.y + 0.1 - 0.04 };
    const lm = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, v: 0.95 }));
    const put = (idx, p) => { lm[idx] = { x: p.x / ASPECT, y: p.y, z: 0, v: 0.95 }; };
    const right = o.rightHanded;
    put(0, nose);
    put(right ? 12 : 11, sho); put(right ? 11 : 12, sho);
    put(right ? 14 : 13, elbow); put(right ? 13 : 14, gElbow);
    put(right ? 16 : 15, wrist); put(right ? 15 : 16, gWrist);
    put(right ? 20 : 19, index); put(right ? 19 : 20, { x: gWrist.x + 0.02 * face, y: gWrist.y });
    for (const k of [23, 24]) put(k, hip);
    for (const k of [25, 26]) put(k, knee);
    for (const k of [27, 28]) put(k, ankle);
    frames.push({ t: tt, lm });
    truth.push({ wrist, shoulder: sho });
  }
  const r = Math.round(o.releaseT * o.fps);
  return { frames, opts: o, releaseFrame: r, setFrame: Math.round(setT * o.fps), bottomFrame: Math.round(o.dipEnd * o.fps), truth };
}

/** Front-on synthetic shooter (camera faces the player). Shoulders are wide in the image. */
export function makeFrontShot(opts = {}) {
  const o = {
    fps: 60, seconds: 5, rightHanded: true, kneeFlex: 40, setTilt: 5, drift: 0.05, jumpHeight: 0.06,
    dipStart: 1.0, dipEnd: 1.4, riseEnd: 1.65, releaseT: 1.75, landT: 2.15, guideMode: 'near', ...opts,
  };
  const s = 0.12, t = 0.13, torso = 0.17, U = 0.1, Fa = 0.1, y0 = 0.85, x0 = 0.5 * ASPECT;
  const n = Math.round(o.fps * o.seconds);
  const frames = [];
  const setT = o.releaseT - 0.2;
  const f = (d) => (d * Math.PI) / 180;
  const side = o.rightHanded ? -1 : 1; // shooting shoulder is on this side of the image
  for (let i = 0; i < n; i++) {
    const tt = i / o.fps;
    let F = 5;
    if (tt >= o.dipStart && tt < o.dipEnd) F = lerp(5, o.kneeFlex, sstep((tt - o.dipStart) / (o.dipEnd - o.dipStart)));
    else if (tt >= o.dipEnd && tt < o.riseEnd) F = lerp(o.kneeFlex, 2, sstep((tt - o.dipEnd) / (o.riseEnd - o.dipEnd)));
    else if (tt >= o.riseEnd) F = 2;
    const leg = legHeight(F, s, t);
    const jt = (tt - o.riseEnd) / (o.landT - o.riseEnd);
    const lift = jt > 0 && jt < 1 ? o.jumpHeight * Math.sin(Math.PI * jt) : 0;
    const cx = x0 + o.drift * s * sstep(jt), ay = y0 - lift;
    const hip = { y: ay - leg.h }, shoY = hip.y - torso;
    const sho = { x: cx + side * 0.07, y: shoY }, gsho = { x: cx - side * 0.07, y: shoY };
    const low = { x: sho.x, y: shoY + 0.12 };
    const elbowSet = { x: sho.x + side * 0.0, y: shoY + 0.03 };
    const wristSet = { x: elbowSet.x + side * 0.1 * Math.sin(f(o.setTilt)), y: elbowSet.y - 0.1 * Math.cos(f(o.setTilt)) };
    const wristRel = { x: sho.x, y: shoY - (U + Fa) * 0.98 };
    let wrist, elbow;
    if (tt < o.dipEnd) {
      const u = tt > o.dipStart ? sstep((tt - o.dipStart) / (o.dipEnd - o.dipStart)) : 0;
      wrist = { x: lerp(low.x, wristSet.x, u), y: lerp(low.y, wristSet.y, u) };
      elbow = { x: lerp(sho.x, elbowSet.x, u), y: lerp(shoY + 0.08, elbowSet.y, u) };
    } else if (tt < setT) { wrist = wristSet; elbow = elbowSet; }
    else if (tt <= o.releaseT) {
      const u = sstep((tt - setT) / (o.releaseT - setT));
      wrist = { x: lerp(wristSet.x, wristRel.x, u), y: lerp(wristSet.y, wristRel.y, u) };
      elbow = { x: lerp(elbowSet.x, (sho.x + wrist.x) / 2, u), y: lerp(elbowSet.y, (shoY + wrist.y) / 2, u) };
    } else {
      const u = sstep((tt - o.releaseT) / 0.25);
      wrist = { x: wristRel.x, y: lerp(wristRel.y, wristRel.y + 0.05, u) };
      elbow = { x: sho.x, y: (shoY + wrist.y) / 2 };
    }
    const index = { x: wrist.x, y: wrist.y - 0.04 };
    const holding = tt >= o.dipEnd && tt <= o.releaseT + 0.03;
    const gWrist = o.guideMode === 'near' && holding ? { x: wrist.x - side * 0.06, y: wrist.y + 0.03 } : { x: gsho.x, y: shoY + 0.12 };
    const gElbow = { x: gsho.x, y: shoY + 0.08 };
    const lm = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, v: 0.95 }));
    const put = (idx, p) => { lm[idx] = { x: p.x / ASPECT, y: p.y, z: 0, v: 0.95 }; };
    const R = o.rightHanded;
    put(0, { x: cx, y: shoY - 0.09 }); put(7, { x: cx - 0.03, y: shoY - 0.085 }); put(8, { x: cx + 0.03, y: shoY - 0.085 });
    put(R ? 12 : 11, sho); put(R ? 11 : 12, gsho);
    put(R ? 14 : 13, elbow); put(R ? 13 : 14, gElbow);
    put(R ? 16 : 15, wrist); put(R ? 15 : 16, gWrist);
    put(R ? 20 : 19, index); put(R ? 19 : 20, { x: gWrist.x, y: gWrist.y - 0.03 });
    put(23, { x: cx - 0.035, y: hip.y }); put(24, { x: cx + 0.035, y: hip.y });
    const kneeY = (hip.y + ay) / 2;
    put(25, { x: cx - 0.045, y: kneeY }); put(26, { x: cx + 0.045, y: kneeY });
    put(27, { x: cx - 0.04, y: ay }); put(28, { x: cx + 0.04, y: ay });
    put(31, { x: cx - 0.04, y: ay + 0.01 }); put(32, { x: cx + 0.04, y: ay + 0.01 });
    frames.push({ t: tt, lm });
  }
  return { frames, opts: o, releaseFrame: Math.round(o.releaseT * o.fps) };
}
