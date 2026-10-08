// Shooting-form analysis: isolate the shot, detect handedness and camera view, compute the metrics.
// Input frames: [{ t, lm: [{x,y,z,v}] | null }] with x,y normalised to the image (y down).
//
// Two camera views are supported and detected automatically:
//  - side:  best for angles (release angle, elbow at set, knee dip, forward balance, follow-through)
//  - front: best for left/right things (elbow alignment under the ball, sideways balance, off hand)
// Metrics that cannot be measured reliably from a view are simply not reported for it.
import { LM, angleAt, argmax, argmin, clamp, deg, dist, fillGaps, mean, median, smoothSeries } from './mathutil.js';

export const SIDE_METRICS = ['releaseAngle', 'forwardDrift', 'elbowAngle', 'kneeDip', 'releaseHeight', 'followThrough', 'tempo', 'legArmTiming', 'stance', 'guideHand'];
export const FRONT_METRICS = ['elbowAlignment', 'sideDrift', 'releaseHeight', 'tempo', 'legArmTiming', 'stance', 'guideHand'];
export const SHOOTING_METRICS = [...new Set([...SIDE_METRICS, ...FRONT_METRICS])];
export const metricsForView = (view) => (view === 'front' ? FRONT_METRICS : SIDE_METRICS);

/** Build smoothed per-landmark series in aspect-corrected units (x scaled by width/height). */
function buildSeries(frames, aspect, smoothN) {
  const n = frames.length;
  const series = {};
  const vis = {};
  for (const [name, idx] of Object.entries(LM)) {
    const xs = new Array(n).fill(NaN), ys = new Array(n).fill(NaN), zs = new Array(n).fill(NaN), vs = new Array(n).fill(0);
    frames.forEach((f, i) => {
      const p = f.lm && f.lm[idx];
      if (p) { xs[i] = p.x * aspect; ys[i] = p.y; zs[i] = (p.z ?? 0) * aspect; vs[i] = p.v ?? 1; } // z (depth) is on the same scale as x
    });
    const sx = smoothSeries(fillGaps(xs), smoothN), sy = smoothSeries(fillGaps(ys), smoothN), sz = smoothSeries(fillGaps(zs), smoothN);
    series[name] = sx.map((x, i) => ({ x, y: sy[i], z: sz[i] }));
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

/** Score a value against a { good:[min,max], tolerance } range. `tolerance` may be [below, above] when one side should hurt more. */
export function scoreValue(value, range) {
  if (!Number.isFinite(value)) return { status: 'unknown', score: 0 };
  const [lo, hi] = range.good;
  const d = value < lo ? lo - value : value > hi ? value - hi : 0;
  const t = range.tolerance;
  const tol = (Array.isArray(t) ? (value < lo ? t[0] : t[1]) : t) || (hi - lo) * 0.5 || 1;
  const score = Math.round(clamp(100 - (50 * d) / tol, 0, 100));
  const status = d === 0 ? 'good' : d <= tol ? 'borderline' : 'needs-work';
  return { status, score, direction: value < lo ? 'low' : value > hi ? 'high' : 'ok' };
}

export function analyzeShooting(frames, { aspect = 9 / 16, fps = 60, config }) {
  const n = frames.length;
  if (n < Math.round(0.6 * fps)) return { ok: false, error: 'too-short' };
  const ranges = config.moves.shooting.ranges;
  const rate = (sec) => Math.max(1, Math.round(sec * fps));
  // Windows are defined in time (not frames) so 30 fps and 60 fps analysis agree.
  const smoothN = Math.max(3, 2 * Math.round(rate(1 / 12) / 2) + 1);
  const { series: S, vis } = buildSeries(frames, aspect, smoothN);

  // ---- Camera view: front-on shows wide shoulders, side-on shows them stacked.
  const midSh = S.lShoulder.map((p, i) => ({ x: (p.x + S.rShoulder[i].x) / 2, y: (p.y + S.rShoulder[i].y) / 2 }));
  const midHip = S.lHip.map((p, i) => ({ x: (p.x + S.rHip[i].x) / 2, y: (p.y + S.rHip[i].y) / 2 }));
  const torso = median(midSh.map((p, i) => dist(p, midHip[i]))) || 0.1;
  const shoulderW = median(S.lShoulder.map((p, i) => Math.abs(p.x - S.rShoulder[i].x)));
  const widthRatio = shoulderW / torso;
  const view = config.view === 'front' || config.view === 'side' ? config.view : widthRatio > 0.55 ? 'front' : 'side';

  // ---- Handedness: the wrist that gets highest above its shoulder is the shooting hand.
  const rise = (side) => S[side + 'Shoulder'].map((s, i) => s.y - S[side + 'Wrist'][i].y); // >0 = wrist above shoulder
  const riseL = rise('l'), riseR = rise('r');
  const peakL = Math.max(...riseL), peakR = Math.max(...riseR);
  const handGap = Math.abs(peakL - peakR) / torso;
  const hand = peakR >= peakL ? 'right' : 'left';
  const handAmbiguous = handGap < 0.15;
  const side = hand === 'right' ? 'r' : 'l';
  const guide = hand === 'right' ? 'l' : 'r';
  const sh = S[side + 'Shoulder'], el = S[side + 'Elbow'], wr = S[side + 'Wrist'], ix = S[side + 'Index'];
  const gw = S[guide + 'Wrist'];
  const rises = hand === 'right' ? riseR : riseL;
  if (Math.max(peakL, peakR) < -0.15 * torso) return { ok: false, error: 'no-shot' }; // the hands never even reach the shoulders
  let weakShot = Math.max(peakL, peakR) < 0.1 * torso; // forgiving: a doubtful shot is still analysed, just with low confidence

  // ---- Shot isolation. The highest wrist point anchors the shot. The ball leaves the hand as the arm straightens, so the
  //      release is the first frame at (nearly) full elbow extension around that peak (the ball itself is not tracked).
  const peak = argmax(rises);
  const elbowAng = sh.map((s, i) => angleAt(s, el[i], wr[i]));
  const extFrom = Math.max(0, peak - rate(0.35)), extTo = Math.min(n - 1, peak + rate(0.05));
  const extMax = Math.max(...elbowAng.slice(extFrom, extTo + 1).filter(Number.isFinite));
  let release = argmax(elbowAng, extFrom, extTo);
  for (let i = extFrom; i <= extTo; i++) { if (elbowAng[i] >= extMax - 6) { release = i; break; } }
  if (release < 0) release = Math.max(0, peak);

  // Is it really a shot?
  if (view === 'side') {
    // elbow goes from bent to (nearly) straight
    const bentMin = Math.min(...elbowAng.slice(Math.max(0, release - rate(0.9)), release + 1));
    const ext = Math.max(...elbowAng.slice(Math.max(0, release - rate(0.15)), Math.min(n, release + rate(0.1) + 1)));
    if (!(ext - bentMin >= 15)) weakShot = true;
  } else {
    // hand travels from around chest height to above the head
    const from = Math.max(0, peak - rate(0.9));
    const travel = Math.max(...wr.slice(from, peak + 1).map((p) => p.y)) - wr[peak].y;
    if (!(travel >= 0.4 * torso) || !(wr[peak].y < S.nose[peak].y)) weakShot = true;
  }

  // Facing direction (+1 = facing right in the image): arm reach, nose vs ears and toes vs ankles vote.
  let armVote = 0;
  for (let i = Math.max(0, release - rate(0.15)); i <= Math.min(n - 1, release + rate(0.1)); i++) armVote += wr[i].x - sh[i].x;
  const noseVote = mean(S.nose.map((p, i) => p.x - (S.lEar[i].x + S.rEar[i].x) / 2));
  const toeVote = mean(S.lFoot.map((p, i) => (p.x - S.lAnkle[i].x) + (S.rFoot[i].x - S.rAnkle[i].x)));
  const votes = [armVote, noseVote, toeVote].map((v) => (Number.isFinite(v) ? Math.sign(v) * Math.min(1, Math.abs(v) / 0.01) : 0));
  const facing = Math.sign(votes[0] * 1.5 + votes[1] + votes[2]) || 1;

  const hipY = midHip.map((p) => p.y);
  const hipX = midHip.map((p) => p.x);
  const ankY = S.lAnkle.map((a, i) => (a.y + S.rAnkle[i].y) / 2);

  // Lowest point of the shot: deepest knee bend (side view) / lowest hips (front view), before release.
  const flexAt = (i) => mean([180 - angleAt(S.lHip[i], S.lKnee[i], S.lAnkle[i]), 180 - angleAt(S.rHip[i], S.rKnee[i], S.rAnkle[i])]);
  const kneeFlex = smoothSeries(frames.map((_, i) => flexAt(i)), 3);
  const bottomFrom = Math.max(0, release - rate(1.6));
  const bottomTo = Math.max(bottomFrom, release - rate(0.1));
  const bottomAt = view === 'side' ? argmax(kneeFlex, bottomFrom, bottomTo) : argmax(hipY, bottomFrom, bottomTo);
  const bottom = bottomAt >= 0 ? bottomAt : bottomFrom; // no usable knee/hip data in the window: fall back to its start

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

  // Set point = the held-ball moment just before the arm drives up.
  let set, setFound = true, best = Infinity;
  if (view === 'side') {
    set = -1;
    for (let i = bottom; i < release; i++) {
      if (wr[i].y < el[i].y && elbowAng[i] < best) { best = elbowAng[i]; set = i; }
    }
    setFound = set >= 0;
    if (setFound) { // elbow flexion plateaus while the ball is held: use the last frame of the plateau
      for (let i = set; i < release; i++) if (wr[i].y < el[i].y && elbowAng[i] <= best + 4) set = i;
    } else set = Math.round(bottom + 0.6 * (release - bottom));
  } else {
    set = Math.max(bottom, release - rate(0.28));
  }
  set = Math.min(set, Math.max(0, release - 1));

  // Start of the load for tempo: last frame before the bottom where hips were still near standing height.
  const hipBase = Math.min(...hipY.slice(Math.max(0, bottom - rate(1.5)), bottom + 1));
  const dipRange = hipY[bottom] - hipBase;
  let loadStart = bottom;
  if (dipRange > 0.01) {
    for (let i = bottom; i >= Math.max(0, bottom - rate(1.5)); i--) { if (hipY[i] <= hipBase + 0.15 * dipRange) { loadStart = i; break; } loadStart = i; }
  }

  // Follow-through frame: fingers pointing furthest below the wrist in the 0.4 s after the ball has left.
  const handDown = ix.map((p, i) => deg(Math.atan2(p.y - wr[i].y, Math.abs(p.x - wr[i].x))));
  const follow = argmax(handDown, release, Math.min(n - 1, release + rate(0.4)));

  const m = {};
  const add = (id, value, unit, frame, names, from, to, extra = {}) => {
    const sc = scoreValue(value, ranges[id]);
    m[id] = { id, value, unit, frame, confidence: Number.isFinite(value) ? confidenceFor(vis, names, from, to) : 'low', ...sc, ...extra };
  };
  const armNames = [side === 'r' ? 'rShoulder' : 'lShoulder', side === 'r' ? 'rElbow' : 'lElbow', side === 'r' ? 'rWrist' : 'lWrist'];
  const indexName = side === 'r' ? 'rIndex' : 'lIndex';

  if (view === 'side') {
    // Release angle: the direction the wrist travels over the last moments of the push, up to the release, measured from the
    // horizontal. Uses |horizontal| so it is always 0..90 and independent of which way you face.
    const pushLag = Math.max(2, rate(0.15)), from0 = Math.max(0, release - pushLag);
    const vy = wr[from0].y - wr[release].y, vx = Math.abs(wr[release].x - wr[from0].x);
    add('releaseAngle', vy > 0 ? deg(Math.atan2(vy, vx)) : NaN, 'deg', release, [armNames[2]], from0, release);

    // Forward drift: hip travel takeoff -> landing in shin lengths.
    const driftLanding = ((hipX[landing] - hipX[takeoff]) * facing) / (shin || 1);
    add('forwardDrift', Math.abs(driftLanding), 'shins', landing, ['lHip', 'rHip', 'lAnkle', 'rAnkle'], takeoff, landing, {
      signed: driftLanding, driftAtRelease: ((hipX[release] - hipX[takeoff]) * facing) / (shin || 1),
      landsAfterRelease: (landing - release) / fps, jumped, note: driftLanding >= 0 ? 'forward' : 'backward',
    });

    // Elbow angle at the set point. A nearly straight arm there means we did not find a real set position.
    add('elbowAngle', elbowAng[set], 'deg', set, armNames, set - 2, set + 2);
    if (!setFound || elbowAng[set] > 140) m.elbowAngle.confidence = 'low';

    // Knee dip: deepest knee bend of the shot (flexion = 180 - interior angle, averaged over both legs).
    add('kneeDip', kneeFlex[bottom], 'deg', bottom, ['lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle'], bottom - 3, bottom + 3);

    // Follow-through: how far the fingers point toward the floor after release.
    add('followThrough', handDown[follow], 'deg', follow, [armNames[2], indexName], release, follow);
  } else {
    // Elbow alignment (front only): tilt of the forearm from vertical while the ball rises.
    // 0 = elbow directly under the ball; a big number = elbow flaring out.
    const tilts = [];
    const rEnd = Math.max(set + 1, Math.round(set + 0.6 * (release - set)));
    for (let i = set; i <= Math.min(rEnd, n - 1); i++) tilts.push(deg(Math.atan2(Math.abs(wr[i].x - el[i].x), Math.max(1e-6, el[i].y - wr[i].y))));
    add('elbowAlignment', mean(tilts), 'deg', set, armNames, set, rEnd);

    // Sideways drift: hip travel takeoff -> landing in shoulder widths.
    const sideways = Math.abs(hipX[landing] - hipX[takeoff]) / (shoulderW || 1);
    add('sideDrift', sideways, 'shoulders', landing, ['lHip', 'rHip', 'lAnkle', 'rAnkle'], takeoff, landing, { jumped });
  }

  // Stance: how far apart the feet are before the dip. Front view: the sideways gap in shoulder widths. Side view: the gap
  // cannot be seen directly (it points at the camera), so it is estimated from the feet's depth as well as their spacing,
  // in shin lengths, and always reported with low confidence.
  {
    const idx = Array.from({ length: Math.max(0, baseTo - baseFrom + 1) }, (_, k) => baseFrom + k);
    const names = ['lAnkle', 'rAnkle', 'lHip', 'rHip'];
    if (view === 'front') {
      add('stance', median(idx.map((i) => Math.abs(S.lAnkle[i].x - S.rAnkle[i].x))) / (shoulderW || 1), 'shoulders', baseTo, names, baseFrom, baseTo);
    } else {
      add('stance', median(idx.map((i) => Math.hypot(S.lAnkle[i].x - S.rAnkle[i].x, S.lAnkle[i].z - S.rAnkle[i].z))) / (shin || 1), 'shins', baseTo, names, baseFrom, baseTo);
      m.stance.confidence = 'low'; // depth from a single camera is rough
    }
  }

  // Leg-to-arm timing: the gap between the legs finishing their push and the arm finishing its extension.
  // Smooth shooters overlap the two; a gap means the shot has two separate parts (or the arm fires before the legs).
  const legEnd = Math.min(n - 1, release + rate(0.3));
  // Knee angles are squashed when facing the camera, so the front view follows the hips rising back to standing height instead.
  const legSig = view === 'front' ? hipY : kneeFlex, legRef = view === 'front' ? hipBase : 0;
  const legStart = legSig[bottom], legDepth = Math.abs(legStart - legRef);
  let legsDone = view === 'front' ? argmin(hipY, bottom, legEnd) : argmin(kneeFlex, bottom, legEnd);
  for (let i = bottom; i <= legEnd; i++) { if (Math.abs(legSig[i] - legRef) <= 0.2 * legDepth) { legsDone = i; break; } }
  const armEnd = Math.min(n - 1, release + rate(0.15));
  const armPeak = Math.max(...elbowAng.slice(set, armEnd + 1).filter(Number.isFinite));
  let armDone = argmax(elbowAng, set, armEnd);
  for (let i = set; i <= armEnd; i++) { if (elbowAng[i] >= armPeak - 6) { armDone = i; break; } }
  const timing = legsDone >= 0 && armDone >= 0 ? (armDone - legsDone) / fps : NaN;
  add('legArmTiming', Math.abs(timing), 's', armDone >= 0 ? armDone : release, ['lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle', ...armNames], Math.min(legsDone, armDone), Math.max(legsDone, armDone),
    { signed: timing, note: timing >= 0 ? 'arm finishes after the legs' : 'arm finishes before the legs' });

  // Release height: where the ball leaves the hand (fingertip at the release frame) relative to standing height.
  add('releaseHeight', (ankBase - ix[release].y) / (standingH || 1), 'x height', release, [armNames[2], indexName], release - 2, release + 2);

  // Tempo: load start -> release.
  add('tempo', (release - loadStart) / fps, 's', release, ['lHip', 'rHip'], loadStart, release);

  // Guide (off) hand: distance between the two wrists while the ball is held and rising, in forearm lengths.
  const gEnd = Math.max(set + 1, Math.round(set + 0.5 * (release - set)));
  const gd = [];
  for (let i = set; i <= Math.min(gEnd, n - 1); i++) gd.push(dist(gw[i], wr[i]) / (dist(el[i], wr[i]) || 1));
  add('guideHand', mean(gd), 'forearms', set, [armNames[2], guide === 'r' ? 'rWrist' : 'lWrist'], set, gEnd);

  if (weakShot) for (const id of Object.keys(m)) m[id].confidence = 'low';
  return {
    ok: true, hand, handAmbiguous, weakShot, facing, view, widthRatio,
    phases: { loadStart, bottom, takeoff, set, release, follow, apex, landing },
    metrics: m,
    metricIds: metricsForView(view),
    guideHand: hand === 'right' ? 'left' : 'right',
  };
}

/** Headline score = weighted mean of the scores of the metrics that were measured. */
export function headlineScore(metrics, weights) {
  let s = 0, w = 0;
  for (const id of Object.keys(metrics)) {
    const wt = weights[id] ?? 1;
    if (metrics[id] && metrics[id].status !== 'unknown') { s += metrics[id].score * wt; w += wt; }
  }
  return w ? Math.round(s / w) : 0;
}
