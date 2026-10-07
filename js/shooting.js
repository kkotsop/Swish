// Shooting-form analysis: isolate the shot, detect handedness, compute the 8 metrics.
// Input frames: [{ t, lm: [{x,y,z,v}] | null }] with x,y normalised to the image (y down).
import { LM, angleAt, argmax, argmin, clamp, deg, dist, fillGaps, mean, median, smoothSeries } from './mathutil.js';

export const SHOOTING_METRICS = [
  'releaseAngle', 'forwardDrift', 'elbowAngle', 'kneeDip',
  'elbowAlignment', 'releaseHeight', 'followThrough', 'tempo', 'guideHand',
];

/** Build smoothed per-landmark series in aspect-corrected units (x scaled by width/height). */
function buildSeries(frames, aspect, smoothN) {
  const n = frames.length;
  const series = {};
  const vis = {};
  for (const [name, idx] of Object.entries(LM)) {
    const xs = new Array(n).fill(NaN), ys = new Array(n).fill(NaN), vs = new Array(n).fill(0);
    frames.forEach((f, i) => {
      const p = f.lm && f.lm[idx];
      if (p) { xs[i] = p.x * aspect; ys[i] = p.y; vs[i] = p.v ?? 1; }
    });
    const sx = smoothSeries(fillGaps(xs), smoothN), sy = smoothSeries(fillGaps(ys), smoothN);
    series[name] = sx.map((x, i) => ({ x, y: sy[i] }));
    vis[name] = vs;
  }
  return { series, vis };
}

const confLabel = (v) => (v >= 0.8 ? 'high' : v >= 0.55 ? 'medium' : 'low');
function confidenceFor(vis, names, from, to) {
  const vals = [];
  for (const nm of names) for (let i = Math.max(0, from); i <= Math.min(vis[nm].length - 1, to); i++) vals.push(vis[nm][i]);
  return confLabel(mean(vals));
}

/** Score a value against a { good:[min,max], tolerance } range. */
export function scoreValue(value, range) {
  if (!Number.isFinite(value)) return { status: 'unknown', score: 0 };
  const [lo, hi] = range.good;
  const d = value < lo ? lo - value : value > hi ? value - hi : 0;
  const tol = range.tolerance || (hi - lo) * 0.5 || 1;
  const score = Math.round(clamp(100 - (50 * d) / tol, 0, 100));
  const status = d === 0 ? 'good' : d <= tol ? 'borderline' : 'needs-work';
  return { status, score, direction: value < lo ? 'low' : value > hi ? 'high' : 'ok' };
}

export function analyzeShooting(frames, { aspect = 9 / 16, fps = 60, config }) {
  const n = frames.length;
  if (n < fps) return { ok: false, error: 'too-short' };
  const ranges = config.moves.shooting.ranges;
  const rate = (sec) => Math.max(1, Math.round(sec * fps));
  // Windows are defined in time (not frames) so 30 fps and 60 fps analysis agree.
  const smoothN = Math.max(3, 2 * Math.round(rate(1 / 12) / 2) + 1);
  const { series: S, vis } = buildSeries(frames, aspect, smoothN);

  // ---- Handedness: the wrist that gets highest above its shoulder is the shooting hand.
  const rise = (side) => S[side + 'Shoulder'].map((s, i) => s.y - S[side + 'Wrist'][i].y); // >0 = wrist above shoulder
  const riseL = rise('l'), riseR = rise('r');
  const peakL = Math.max(...riseL), peakR = Math.max(...riseR);
  const bodyH = (() => {
    const hip = S.lHip.map((h, i) => (h.y + S.rHip[i].y) / 2);
    const sh = S.lShoulder.map((h, i) => (h.y + S.rShoulder[i].y) / 2);
    return median(hip.map((h, i) => h - sh[i])); // torso length, used only as a scale for hand detection
  })();
  const handGap = Math.abs(peakL - peakR) / (bodyH || 1);
  const hand = peakR >= peakL ? 'right' : 'left';
  const handAmbiguous = handGap < 0.15;
  const side = hand === 'right' ? 'r' : 'l';
  const guide = hand === 'right' ? 'l' : 'r';
  const sh = S[side + 'Shoulder'], el = S[side + 'Elbow'], wr = S[side + 'Wrist'], ix = S[side + 'Index'];
  const gw = S[guide + 'Wrist'];
  const rises = hand === 'right' ? riseR : riseL;
  if (Math.max(peakL, peakR) < 0.1 * (bodyH || 1)) return { ok: false, error: 'no-shot' };

  // ---- Shot isolation: peak wrist height defines the shot; release = full arm extension near that peak.
  const peak = argmax(rises);
  const elbowAng = sh.map((s, i) => angleAt(s, el[i], wr[i]));
  const relFrom = Math.max(0, peak - rate(0.2)), relTo = Math.min(n - 1, peak + rate(0.1));
  const release = argmax(elbowAng, relFrom, relTo);

  // A real shot has the elbow going from bent to straight. A raised arm that stays straight is not a shot.
  const bentMin = Math.min(...elbowAng.slice(Math.max(0, release - rate(0.9)), release + 1));
  if (!(elbowAng[release] - bentMin >= 25)) return { ok: false, error: 'no-shot' };

  // Facing direction (+1 = facing right in the image) from the arm extending toward the basket.
  let facingSum = 0;
  for (let i = Math.max(0, release - rate(0.15)); i <= Math.min(n - 1, release + rate(0.1)); i++) facingSum += wr[i].x - sh[i].x;
  const noseHip = mean(S.nose.map((p, i) => p.x - (S.lHip[i].x + S.rHip[i].x) / 2));
  const facing = Math.abs(facingSum) > 1e-4 ? Math.sign(facingSum) : Math.sign(noseHip) || 1;

  const hipY = S.lHip.map((h, i) => (h.y + S.rHip[i].y) / 2);
  const hipX = S.lHip.map((h, i) => (h.x + S.rHip[i].x) / 2);
  const ankY = S.lAnkle.map((a, i) => (a.y + S.rAnkle[i].y) / 2);

  // Lowest point of the shot = the frame of deepest knee bend (max flexion) before the jump/release.
  const flexAt = (i) => mean([180 - angleAt(S.lHip[i], S.lKnee[i], S.lAnkle[i]), 180 - angleAt(S.rHip[i], S.rKnee[i], S.rAnkle[i])]);
  const kneeFlex = smoothSeries(frames.map((_, i) => flexAt(i)), 3);
  const bottomFrom = Math.max(0, release - rate(1.6));
  const bottom = argmax(kneeFlex, bottomFrom, Math.max(bottomFrom, release - rate(0.1)));

  // Standing baseline for ankles/nose (before the dip) -> body height and takeoff/landing detection.
  const baseTo = Math.max(1, bottom - rate(0.1)), baseFrom = Math.max(0, baseTo - rate(0.6));
  const ankBase = median(ankY.slice(baseFrom, baseTo + 1).length ? ankY.slice(baseFrom, baseTo + 1) : ankY.slice(0, rate(0.5)));
  const noseBase = median(S.nose.slice(baseFrom, baseTo + 1).map((p) => p.y));
  const standingH = (ankBase - noseBase) * 1.12; // nose->crown allowance
  const shin = median(S.lKnee.map((k, i) => (dist(k, S.lAnkle[i]) + dist(S.rKnee[i], S.rAnkle[i])) / 2));
  const jumpEps = 0.03 * standingH;

  let takeoff = bottom;
  for (let i = bottom; i <= release; i++) { if (ankBase - ankY[i] > jumpEps) { takeoff = i; break; } takeoff = i; }
  const apex = argmin(ankY, takeoff, Math.min(n - 1, release + rate(0.5)));
  let landing = n - 1;
  for (let i = Math.max(apex, release); i < n; i++) { if (ankBase - ankY[i] <= jumpEps) { landing = i; break; } }
  const jumped = ankBase - ankY[apex] > jumpEps;

  // Set point: held-ball moment = most bent elbow after the dip while the hand is above the elbow
  // (forearm roughly upright, ball in front of the face/shoulder), just before the arm extends.
  let set = -1, best = Infinity;
  for (let i = bottom; i < release; i++) {
    if (wr[i].y < el[i].y && elbowAng[i] < best) { best = elbowAng[i]; set = i; }
  }
  let setFound = set >= 0;
  if (setFound) { // elbow flexion plateaus while the ball is held: use the last frame of the plateau
    for (let i = set; i < release; i++) if (wr[i].y < el[i].y && elbowAng[i] <= best + 4) set = i;
  } else set = Math.round(bottom + 0.6 * (release - bottom));

  // Start of the load for tempo: last frame before the bottom where hips were still near standing height.
  const hipBase = Math.min(...hipY.slice(Math.max(0, bottom - rate(1.5)), bottom + 1));
  const dipRange = hipY[bottom] - hipBase;
  let loadStart = bottom;
  if (dipRange > 0.01) {
    for (let i = bottom; i >= Math.max(0, bottom - rate(1.5)); i--) { if (hipY[i] <= hipBase + 0.15 * dipRange) { loadStart = i; break; } loadStart = i; }
  }

  // Follow-through frame: most downward-pointing hand within 0.3 s after release.
  const handDown = ix.map((p, i) => deg(Math.atan2(p.y - wr[i].y, (p.x - wr[i].x) * facing)));
  const follow = argmax(handDown, release, Math.min(n - 1, release + rate(0.3)));

  const m = {};
  const add = (id, value, unit, frame, names, from, to, extra = {}) => {
    const sc = scoreValue(value, ranges[id]);
    m[id] = { id, value, unit, frame, confidence: Number.isFinite(value) ? confidenceFor(vis, names, from, to) : 'low', ...sc, ...extra };
  };
  const armNames = [side === 'r' ? 'rShoulder' : 'lShoulder', side === 'r' ? 'rElbow' : 'lElbow', side === 'r' ? 'rWrist' : 'lWrist'];

  // 1. Release angle: direction of travel of the shooting wrist at its fastest upward moment up to release.
  //    Always measured on a frame where the hand is moving up, so it can never come out negative.
  const lag = Math.max(2, rate(0.066));
  let relIdx = -1, relSpeed = 0, relAngle = NaN;
  for (let i = Math.max(lag, release - rate(0.3)); i <= Math.min(n - 1, release + rate(0.05)); i++) {
    const vy = wr[i - lag].y - wr[i].y, vx = (wr[i].x - wr[i - lag].x) * facing, sp = Math.hypot(vx, vy);
    if (vy > 0 && sp > relSpeed) { relSpeed = sp; relIdx = i; relAngle = deg(Math.atan2(vy, vx)); }
  }
  add('releaseAngle', relAngle, 'deg', release, [armNames[2]], Math.max(0, (relIdx < 0 ? release : relIdx) - lag), release);

  // 2. Forward drift: hip travel takeoff -> landing in shin lengths, plus how much happened before release.
  const driftLanding = ((hipX[landing] - hipX[takeoff]) * facing) / (shin || 1);
  const driftAtRelease = ((hipX[release] - hipX[takeoff]) * facing) / (shin || 1);
  add('forwardDrift', Math.abs(driftLanding), 'shins', landing, ['lHip', 'rHip', 'lAnkle', 'rAnkle'], takeoff, landing, {
    signed: driftLanding, driftAtRelease, landsAfterRelease: (landing - release) / fps, jumped,
    note: driftLanding >= 0 ? 'forward' : 'backward',
  });

  // 3. Elbow angle at the set point. A nearly straight arm there means we did not find a real set position.
  add('elbowAngle', elbowAng[set], 'deg', set, armNames, set - 2, set + 2);
  if (!setFound || elbowAng[set] > 140) m.elbowAngle.confidence = 'low';

  // 4. Knee dip: deepest knee bend of the shot (flexion = 180 - interior angle, averaged over both legs).
  add('kneeDip', kneeFlex[bottom], 'deg', bottom, ['lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle'], bottom - 3, bottom + 3);

  // 5. Elbow alignment: mean forearm tilt from vertical while the ball rises (set -> release).
  const tilts = [];
  const rEnd = Math.max(set + 1, Math.round(set + 0.6 * (release - set)));
  for (let i = set; i <= rEnd; i++) tilts.push(deg(Math.atan2(Math.abs(wr[i].x - el[i].x), Math.max(1e-6, el[i].y - wr[i].y))));
  add('elbowAlignment', mean(tilts), 'deg', set, armNames, set, rEnd);

  // 6. Release height relative to standing height (ankles to crown).
  add('releaseHeight', (ankBase - wr[release].y) / (standingH || 1), 'x height', release, [armNames[2]], release - 2, release + 2);

  // 7. Follow-through: how far the fingers point toward the floor after release.
  add('followThrough', handDown[follow], 'deg', follow, [armNames[2], side === 'r' ? 'rIndex' : 'lIndex'], release, follow);

  // 8. Tempo: load start -> release.
  add('tempo', (release - loadStart) / fps, 's', release, ['lHip', 'rHip', 'lKnee', 'rKnee'], loadStart, release);

  // 9. Guide (off) hand: distance between the two wrists while the ball is held and rising, in forearm lengths.
  //    Close = the off hand rides on the side of the ball; far = it is floating away or hanging low.
  const gEnd = Math.max(set + 1, Math.round(set + 0.5 * (release - set)));
  const gd = [];
  for (let i = set; i <= gEnd; i++) gd.push(dist(gw[i], wr[i]) / (dist(el[i], wr[i]) || 1));
  add('guideHand', mean(gd), 'forearms', set, [armNames[2], guide === 'r' ? 'rWrist' : 'lWrist'], set, gEnd);

  return {
    ok: true, hand, handAmbiguous, facing,
    phases: { loadStart, bottom, takeoff, set, release, follow, apex, landing },
    metrics: m,
    guideHand: hand === 'right' ? 'left' : 'right',
  };
}

/** Headline score = weighted mean of metric scores. */
export function headlineScore(metrics, weights) {
  let s = 0, w = 0;
  for (const id of SHOOTING_METRICS) {
    const wt = weights[id] ?? 1;
    if (metrics[id] && metrics[id].status !== 'unknown') { s += metrics[id].score * wt; w += wt; }
  }
  return w ? Math.round(s / w) : 0;
}
