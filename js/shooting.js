// Shooting-form analysis: isolate the shot, detect handedness and camera view, compute the metrics.
// Input frames: [{ t, lm: [{x,y,z,v}] | null }] with x,y normalised to the image (y down).
//
// Two camera views are supported and detected automatically:
//  - side:  best for angles (release angle, knee dip, forward balance)
//  - front: best for left/right things (elbow alignment under the ball, off hand)
// Metrics that cannot be measured reliably from a view are simply not reported for it.
import { LM, angleAt, argmax, argmin, clamp, deg, dist, fillGaps, mean, median, smoothSeries } from './mathutil.js';

export const SIDE_METRICS = ['releaseAngle', 'forwardDrift', 'kneeDip', 'releaseHeight', 'tempo', 'legArmTiming', 'guideHand'];
export const FRONT_METRICS = ['elbowAlignment', 'releaseHeight', 'tempo', 'legArmTiming', 'stance', 'guideHand'];
export const SHOOTING_METRICS = [...new Set([...SIDE_METRICS, ...FRONT_METRICS])];
export const metricsForView = (view) => (view === 'front' ? FRONT_METRICS : SIDE_METRICS);
/** Every card the report shows. A metric the clip could not measure keeps its card, left blank, instead of disappearing. */
export const displayMetrics = (view) => (view === 'front' ? SHOOTING_METRICS : SIDE_METRICS);
/** An empty result for a metric this clip could not give: no value, no score, and a line saying how to get one. */
const BLANK_UNIT = { releaseAngle: 'deg', kneeDip: 'deg', elbowAlignment: 'deg', forwardDrift: 'shins', stance: 'shoulders', legArmTiming: 's', tempo: 's', releaseHeight: 'x height', guideHand: 'forearms' };
export function blankMetric(id, frame) {
  const reason = FRONT_METRICS.includes(id) && !SIDE_METRICS.includes(id)
    ? 'This one is only measured from the front. Film facing the phone to see it.'
    : 'This one is only measured from the side. Film side-on to see it.';
  return { id, value: NaN, unit: BLANK_UNIT[id] || '', frame, confidence: 'low', status: 'unknown', score: 0, reason }; // the unit keeps the target text right (45–55°)
}

/** Build smoothed per-landmark series in aspect-corrected units (x scaled by width/height), in the world (camera movement taken out). */
function buildSeries(frames, aspect, smoothN) {
  const n = frames.length;
  const series = {};
  const vis = {};
  for (const [name, idx] of Object.entries(LM)) {
    const xs = new Array(n).fill(NaN), ys = new Array(n).fill(NaN), zs = new Array(n).fill(NaN), vs = new Array(n).fill(0);
    frames.forEach((f, i) => {
      const p = f.lm && f.lm[idx];
      const cx = f.cam ? f.cam.x : 0, cy = f.cam ? f.cam.y : 0; // the phone may have panned while following the player
      if (p) { xs[i] = (p.x - cx) * aspect; ys[i] = p.y - cy; zs[i] = (p.z ?? 0) * aspect; vs[i] = p.v ?? 1; } // z (depth) is on the same scale as x
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

/**
 * Score a value against a { good:[min,max], ideal?:[min,max], tolerance } range. `tolerance` may be [below, above] when one
 * side should hurt more. Full marks only inside the ideal zone; the edge of the good zone is 85, the edge of the tolerance 50
 * and twice the tolerance 0, so a 90+ overall needs most metrics close to ideal, not just inside the green.
 * Without an explicit `ideal`, it is the middle 40% of the good zone (or its lower 40% when the zone starts at 0: less is better).
 */
export const GOOD_EDGE = 85;
export function idealZone(range) {
  const [lo, hi] = range.good, w = hi - lo;
  return range.ideal || (lo <= 0 ? [lo, lo + 0.4 * w] : [lo + 0.3 * w, hi - 0.3 * w]);
}
export function scoreValue(value, range) {
  if (!Number.isFinite(value)) return { status: 'unknown', score: 0 };
  const [lo, hi] = range.good;
  const d = value < lo ? lo - value : value > hi ? value - hi : 0;
  const t = range.tolerance;
  const tol = (Array.isArray(t) ? (value < lo ? t[0] : t[1]) : t) || (hi - lo) * 0.5 || 1;
  let score;
  if (d === 0) {
    const [a, b] = idealZone(range);
    const off = value < a ? (a - value) / (a - lo || 1) : value > b ? (value - b) / (hi - b || 1) : 0;
    score = 100 - (100 - GOOD_EDGE) * clamp(off, 0, 1);
  } else score = d <= tol ? GOOD_EDGE - ((GOOD_EDGE - 50) * d) / tol : 50 - (50 * (d - tol)) / tol;
  score = Math.round(clamp(score, 0, 100));
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

  // ---- Where the shot is: the highest either wrist gets above its shoulder. View and hand are judged around it, not while
  //      the player walks in or turns away.
  const rise = (side) => S[side + 'Shoulder'].map((s, i) => s.y - S[side + 'Wrist'][i].y); // >0 = wrist above shoulder
  const riseL = rise('l'), riseR = rise('r');
  const peak0 = argmax(riseL.map((v, i) => Math.max(v, riseR[i])));
  const midSh = S.lShoulder.map((p, i) => ({ x: (p.x + S.rShoulder[i].x) / 2, y: (p.y + S.rShoulder[i].y) / 2 }));
  const midHip = S.lHip.map((p, i) => ({ x: (p.x + S.rHip[i].x) / 2, y: (p.y + S.rHip[i].y) / 2 }));
  const torso = median(midSh.map((p, i) => dist(p, midHip[i]))) || 0.1;
  const shoulderW = median(S.lShoulder.map((p, i) => Math.abs(p.x - S.rShoulder[i].x)));
  const around = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k);
  const shotWin = around(Math.max(0, peak0 - rate(1.0)), peak0);

  // ---- Camera view: front-on shows wide shoulders, side-on shows them stacked (measured during the shot only).
  const widthRatio = median(shotWin.map((i) => Math.abs(S.lShoulder[i].x - S.rShoulder[i].x) / (dist(midSh[i], midHip[i]) || torso)));
  // Cut-off from real clips: side-on read 0.04-0.18, front-on and three-quarter clips 0.49-0.69 (shoulder width / torso length).
  // 0.32 is about 22 degrees off side-on; anything more turned toward the camera counts as front.
  const split = config.viewSplit ?? 0.32;
  const view = config.view === 'front' || config.view === 'side' ? config.view : widthRatio > split ? 'front' : 'side';
  const viewAngled = widthRatio > split * 0.7 && widthRatio < split * 1.4; // close to the cut-off: the angle is neither clearly side nor front

  // ---- Shooting hand. Clues: the shooting arm straightens fully at the top of the shot (the guide hand comes off the ball
  //      still bent) and its wrist gets highest. Side-on, the two arms sit on top of each other in the picture and cannot be
  //      told apart, so the hand set in the player's profile is used (config.hand); without one it is a labelled guess.
  const elbowOf = (sd) => S[sd + 'Shoulder'].map((p, i) => angleAt(p, S[sd + 'Elbow'][i], S[sd + 'Wrist'][i]));
  const angL = elbowOf('l'), angR = elbowOf('r');
  const topWin = around(Math.max(0, peak0 - rate(0.3)), Math.min(n - 1, peak0 + rate(0.15)));
  const maxOf = (a) => Math.max(...topWin.map((i) => a[i]).filter(Number.isFinite));
  const extGap = maxOf(angR) - maxOf(angL); // degrees, > 0 = right arm straighter
  const riseGap = (maxOf(riseR) - maxOf(riseL)) / torso; // > 0 = right wrist higher
  const armsApart = median(topWin.map((i) => (dist(S.lWrist[i], S.rWrist[i]) + dist(S.lElbow[i], S.rElbow[i])) / 2)) / torso;
  const vote = (Number.isFinite(extGap) ? clamp(extGap / 15, -1.5, 1.5) : 0) + (Number.isFinite(riseGap) ? clamp(riseGap / 0.15, -1.5, 1.5) : 0);
  const reachedTop = Math.max(maxOf(angL), maxOf(angR)) >= 150; // a clip cut before the release must not decide the hand
  const handSeen = reachedTop && armsApart >= 0.25 && Math.abs(vote) >= 1; // two separate arms, a real release, clues clearly one way
  const preset = config.hand === 'left' || config.hand === 'right' ? config.hand : null;
  const hand = preset || (vote >= 0 ? 'right' : 'left');
  const handSource = preset ? 'profile' : handSeen ? 'detected' : 'guess';
  const handAmbiguous = handSource === 'guess';
  const handGap = vote;
  const side = hand === 'right' ? 'r' : 'l';
  const guide = hand === 'right' ? 'l' : 'r';
  const sh = S[side + 'Shoulder'], el = S[side + 'Elbow'], wr = S[side + 'Wrist'], ix = S[side + 'Index'];
  const gw = S[guide + 'Wrist'];
  const rises = hand === 'right' ? riseR : riseL;
  const peakL = Math.max(...riseL), peakR = Math.max(...riseR);
  if (Math.max(peakL, peakR) < -0.15 * torso) return { ok: false, error: 'no-shot' }; // the hands never even reach the shoulders
  let weakShot = Math.max(peakL, peakR) < 0.1 * torso; // forgiving: a doubtful shot is still analysed, just with low confidence

  // ---- Shot isolation. The highest wrist point anchors the shot. The ball leaves the hand as the arm straightens, so the
  //      release is the first frame at (nearly) full elbow extension around that peak (the ball itself is not tracked).
  const peak = argmax(rises);
  const elbowAng = sh.map((s, i) => angleAt(s, el[i], wr[i]));
  // The ball leaves as the elbow goes from bent to straight, which is NOT always when the hand is highest: a slow follow-through
  // keeps the arm rising for another half second. So start from the most bent moment before the peak (the set) and take the
  // first frame after it where the elbow is (nearly) straight.
  const winFrom = Math.max(0, peak - rate(1.2)), extTo = Math.min(n - 1, peak + rate(0.05));
  const bentAt = argmin(elbowAng, winFrom, peak);
  const extFrom = bentAt >= 0 ? bentAt : winFrom;
  const extMax = Math.max(...elbowAng.slice(extFrom, extTo + 1).filter(Number.isFinite));
  const straight = Math.min(160, extMax - 6);
  let release = argmax(elbowAng, extFrom, extTo);
  for (let i = extFrom; i <= extTo; i++) { if (elbowAng[i] >= straight) { release = i; break; } }
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

  // The feet can leave the floor after the ball has left the hand (a shot released early in the jump), so look past the release.
  const jumpEnd = Math.min(n - 1, release + rate(0.7));
  let takeoff = bottom;
  for (let i = bottom; i <= jumpEnd; i++) { if (ankBase - ankY[i] > jumpEps) { takeoff = i; break; } takeoff = i; }
  const apex = argmin(ankY, takeoff, jumpEnd);
  const jumped = ankBase - ankY[apex] > jumpEps;
  let landing = jumped ? Math.min(n - 1, apex + rate(0.4)) : Math.min(n - 1, release + rate(0.4));
  if (jumped) for (let i = apex; i <= Math.min(n - 1, apex + rate(1.0)); i++) { if (ankBase - ankY[i] <= jumpEps) { landing = i; break; } }

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

  const m = {};
  const add = (id, value, unit, frame, names, from, to, extra = {}) => {
    const sc = scoreValue(value, ranges[id]);
    m[id] = { id, value, unit, frame, confidence: Number.isFinite(value) ? confidenceFor(vis, names, from, to) : 'low', ...sc, ...extra };
  };
  const armNames = [side === 'r' ? 'rShoulder' : 'lShoulder', side === 'r' ? 'rElbow' : 'lElbow', side === 'r' ? 'rWrist' : 'lWrist'];
  const indexName = side === 'r' ? 'rIndex' : 'lIndex';

  if (view === 'side') {
    // Release angle: how steeply the arm points when it is fully extended and the ball is leaving the hand, measured from the
    // horizontal along shoulder -> wrist. Flat (a push forward) is the thing to catch; it is always 0..90 and independent of
    // which way you face. Read over three frames around the release so one noisy frame cannot decide it.
    const armDeg = (i) => deg(Math.atan2(sh[i].y - wr[i].y, Math.abs(wr[i].x - sh[i].x)));
    const rFrames = [release - 1, release, release + 1].filter((i) => i >= 0 && i < n);
    add('releaseAngle', clamp(median(rFrames.map(armDeg)), 0, 90), 'deg', release, armNames, release - 1, release + 1);

    // Forward drift: where the hips are when you land against where you started (before the dip), in shin lengths. Positions
    // are in the world, so a phone that pans to follow you does not hide the movement. `ghost` is your starting pose placed on
    // the landing picture, so the card can show both.
    const start = Math.min(loadStart, landing);
    const driftLanding = ((hipX[landing] - hipX[start]) * facing) / (shin || 1);
    const gl = frames[start] && frames[start].lm;
    const camAt = (i) => (frames[i] && frames[i].cam) || { x: 0, y: 0 };
    const ghost = gl ? gl.map((p) => ({ ...p, x: p.x + camAt(landing).x - camAt(start).x, y: p.y + camAt(landing).y - camAt(start).y })) : null;
    add('forwardDrift', Math.abs(driftLanding), 'shins', landing, ['lHip', 'rHip', 'lAnkle', 'rAnkle'], start, landing, {
      signed: driftLanding, jumped, note: driftLanding >= 0 ? 'forward' : 'backward', startFrame: start, ghost,
    });

    // Knee dip: deepest knee bend of the shot (flexion = 180 - interior angle, averaged over both legs).
    add('kneeDip', kneeFlex[bottom], 'deg', bottom, ['lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle'], bottom - 3, bottom + 3);
  } else {
    // Elbow alignment (front only): tilt of the forearm from vertical while the ball rises.
    // 0 = elbow directly under the ball; a big number = elbow flaring out.
    const tilts = [];
    const rEnd = Math.max(set + 1, Math.round(set + 0.6 * (release - set)));
    for (let i = set; i <= Math.min(rEnd, n - 1); i++) tilts.push(deg(Math.atan2(Math.abs(wr[i].x - el[i].x), Math.max(1e-6, el[i].y - wr[i].y))));
    add('elbowAlignment', mean(tilts), 'deg', set, armNames, set, rEnd);
  }

  // Stance (front only): how far apart the feet are before the dip, in shoulder widths. From the side the gap points at the
  // camera and cannot be read, so the side view leaves it blank rather than guessing.
  if (view === 'front') {
    const idx = Array.from({ length: Math.max(0, baseTo - baseFrom + 1) }, (_, k) => baseFrom + k);
    add('stance', median(idx.map((i) => Math.abs(S.lAnkle[i].x - S.rAnkle[i].x))) / (shoulderW || 1), 'shoulders', baseTo, ['lAnkle', 'rAnkle', 'lHip', 'rHip'], baseFrom, baseTo);
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

  // Release height: the highest point the shooting hand reaches around the release (fingertip), relative to standing height.
  const hiAt = argmin(ix.map((p) => p.y), Math.max(0, release - rate(0.1)), Math.min(n - 1, release + rate(0.3)));
  const top = hiAt >= 0 ? hiAt : release;
  add('releaseHeight', (ankBase - ix[top].y) / (standingH || 1), 'x height', top, [armNames[2], indexName], top - 2, top + 2);

  // Tempo: load start -> release.
  add('tempo', (release - loadStart) / fps, 's', release, ['lHip', 'rHip'], loadStart, release);

  // Guide (off) hand: how far below the shooting wrist the guide wrist is as the arm extends and the ball goes, and just after,
  // in forearm lengths (0 = level with the shooting hand, positive = the off hand is lower, negative = higher). A guide hand that
  // has already dropped away while the shooting hand is still up is the fault; the pose model's shoulder-relative height is not
  // used because a hand that is up at the chin can still be well below a hand that is up at full reach.
  const gFrom = release, gTo = Math.min(n - 1, release + rate(0.2));
  const gd = [];
  for (let i = gFrom; i <= gTo; i++) gd.push((gw[i].y - wr[i].y) / (dist(el[i], wr[i]) || 1));
  add('guideHand', mean(gd), 'forearms', release, [armNames[2], guide === 'r' ? 'rWrist' : 'lWrist'], gFrom, gTo);

  if (weakShot) for (const id of Object.keys(m)) m[id].confidence = 'low';
  return {
    ok: true, hand, handAmbiguous, handSource, handGap, weakShot, facing, view, widthRatio, viewAngled,
    phases: { loadStart, bottom, takeoff, set, release, apex, landing },
    metrics: m,
    metricIds: displayMetrics(view),
    guideHand: hand === 'right' ? 'left' : 'right',
  };
}

/** How much a metric counts toward the headline, by how well it was tracked (a guess should not drag the score around). */
export const DEFAULT_CONFIDENCE_WEIGHTS = { high: 1, medium: 0.7, low: 0.25 };

/** Headline score = weighted mean of the scores of the metrics that were measured, each weighted by its tracking confidence. */
export function headlineScore(metrics, weights, confidenceWeights = DEFAULT_CONFIDENCE_WEIGHTS) {
  let s = 0, w = 0;
  for (const id of Object.keys(metrics)) {
    const wt = (weights[id] ?? 1) * (confidenceWeights[metrics[id] && metrics[id].confidence] ?? 1);
    if (metrics[id] && metrics[id].status !== 'unknown') { s += metrics[id].score * wt; w += wt; }
  }
  return w ? Math.round(s / w) : 0;
}
