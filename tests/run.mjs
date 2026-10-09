import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeShooting, headlineScore, scoreValue, SIDE_METRICS, FRONT_METRICS, SHOOTING_METRICS, displayMetrics, blankMetric } from '../js/shooting.js';
import { makeShot, makeFrontShot, ASPECT } from './synth.js';
import { selectSubject, assessTracking, checkFps, poseBox } from '../js/precheck.js';
import { subjectCrop, uncropLandmarks } from '../js/crop.js';
import { rangeFromValues, rangesFromClips } from '../js/calibrate.js';
import { templateAdvice, personalisedAdvice, scoreBand } from '../js/coaching.js';
import { playerBox, fitAspect } from '../js/crop.js';
import { project, rubberband } from '../js/motion.js';
import { weekIndex, journey, milestones, rankFor, LADDER } from '../js/journey.js';
import { camTarget, stepCam, cropRect } from '../js/followcam.js';
import { camPath, grayOf, estimateShift, maskOf } from '../js/camshift.js';

const config = JSON.parse(fs.readFileSync(new URL('../config/settings.json', import.meta.url)));
const run = (o) => { const s = makeShot(o); return { s, r: analyzeShooting(s.frames, { aspect: ASPECT, fps: 60, config }) }; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}±${tol}`);
const near_ = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

test('right-handed shot: phases, hand, direct metrics', () => {
  const { s, r } = run({});
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.hand, 'right'); assert.equal(r.facing, 1);
  assert.equal(r.handSource, 'guess', 'side-on the two arms overlap, so the hand is a labelled guess unless the profile sets it');
  near(r.phases.release, s.releaseFrame, 4, 'release frame');
  near(r.phases.set, s.setFrame, 8, 'set frame');
  near(r.phases.bottom, s.bottomFrame, 4, 'bottom frame');
  near(r.metrics.kneeDip.value, 40, 4, 'knee flexion');
  near(r.metrics.tempo.value, 1.75 - 1.0, 0.18, 'tempo');
  near(r.metrics.forwardDrift.value, 0.1, 0.05, 'drift');
  assert.equal(r.view, 'side');
  assert.deepEqual(Object.keys(r.metrics).sort(), [...SIDE_METRICS].sort());
  for (const gone of ['elbowAngle', 'followThrough', 'sideDrift']) assert.equal(r.metrics[gone], undefined, `${gone} was removed`);
  const sc = headlineScore(r.metrics, config.moves.shooting.weights);
  assert.ok(sc > 0 && sc <= 100);
});

test('left-handed and mirrored (facing left) give the same metrics', () => {
  const a = run({}).r, b = run({ rightHanded: false, mirror: true }).r;
  assert.equal(b.hand, 'left'); assert.equal(b.facing, -1);
  for (const id of Object.keys(a.metrics)) near(b.metrics[id].value, a.metrics[id].value, 2.5, id);
});

test('more drift and a pushed (flatter) release are detected', () => {
  const good = run({}).r, bad = run({ drift: 1.2, releaseDirDeg: 25 }).r;
  assert.ok(bad.metrics.forwardDrift.value > good.metrics.forwardDrift.value + 0.8);
  assert.notEqual(bad.metrics.forwardDrift.status, 'good');
  assert.ok(bad.metrics.releaseAngle.value < good.metrics.releaseAngle.value - 10);
  assert.equal(bad.metrics.forwardDrift.note, 'forward');
});

test('deeper dip scores higher flexion; slower shot has longer tempo', () => {
  const a = run({ kneeFlex: 25 }).r, b = run({ kneeFlex: 60 }).r;
  assert.ok(b.metrics.kneeDip.value > a.metrics.kneeDip.value + 20);
  const slow = run({ dipStart: 0.8, dipEnd: 1.4, riseEnd: 1.9, releaseT: 2.05, landT: 2.4 }).r;
  assert.ok(slow.metrics.tempo.value > run({}).r.metrics.tempo.value + 0.2, `tempo ${slow.metrics.tempo.value}`);
});

test('30 fps analysis agrees with 60 fps analysis', () => {
  const hi = run({}).r;
  const s30 = makeShot({ fps: 30 });
  const lo = analyzeShooting(s30.frames, { aspect: ASPECT, fps: 30, config });
  assert.ok(lo.ok); assert.equal(lo.hand, hi.hand);
  near(lo.metrics.kneeDip.value, hi.metrics.kneeDip.value, 4, 'knee 30 vs 60');
  near(lo.metrics.tempo.value, hi.metrics.tempo.value, 0.15, 'tempo 30 vs 60');
  near(lo.metrics.forwardDrift.value, hi.metrics.forwardDrift.value, 0.06, 'drift 30 vs 60');
  near(lo.metrics.releaseAngle.value, hi.metrics.releaseAngle.value, 12, 'release angle 30 vs 60');
  near(lo.metrics.releaseHeight.value, hi.metrics.releaseHeight.value, 0.05, 'release height 30 vs 60');
});

test('release angle is never negative', () => {
  for (const o of [{}, { releaseDirDeg: 20 }, { releaseDirDeg: 80 }, { rightHanded: false, mirror: true }, { fps: 30 }]) {
    const { r } = run(o.fps ? {} : o);
    const rr = o.fps ? analyzeShooting(makeShot(o).frames, { aspect: ASPECT, fps: o.fps, config }) : r;
    assert.ok(rr.metrics.releaseAngle.value > 0 && rr.metrics.releaseAngle.value <= 90, `release angle ${rr.metrics.releaseAngle.value}`);
  }
});

test('arms held straight up with no bend-to-extend is analysed with low confidence', () => {
  const sh = makeShot({});
  for (const f of sh.frames) { // freeze the right arm straight up for the whole clip
    const S = f.lm[12];
    f.lm[14] = { ...S, y: S.y - 0.1 }; f.lm[16] = { ...S, y: S.y - 0.2 }; f.lm[20] = { ...S, y: S.y - 0.24 };
  }
  const r = analyzeShooting(sh.frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(r.ok && r.weakShot, 'still analysed, but flagged'); // forgiving: low confidence instead of a rejection
  assert.ok(Object.values(r.metrics).every((m) => m.confidence === 'low'));
});

test('knee dip is the deepest bend of the shot', () => {
  const a = run({ kneeFlex: 55 }).r;
  near(a.metrics.kneeDip.value, 55, 4, 'knee at lowest point');
  near(a.phases.bottom, 84, 6, 'bottom frame ~ end of the dip');
});

test('guide hand: near the ball is good, hanging low is flagged', () => {
  const near_ = run({ guideMode: 'near' }).r, low = run({ guideMode: 'low' }).r;
  assert.equal(near_.metrics.guideHand.status, 'good', JSON.stringify(near_.metrics.guideHand));
  assert.ok(low.metrics.guideHand.value > near_.metrics.guideHand.value + 0.8, `${low.metrics.guideHand.value} vs ${near_.metrics.guideHand.value}`);
  assert.notEqual(low.metrics.guideHand.status, 'good');
  assert.equal(near_.guideHand, 'left'); // right-handed shooter -> off hand is the left
});

test('front view is detected and measures only what it can (elbow alignment, off hand, ...)', () => {
  const good = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(good.ok, JSON.stringify(good)); assert.equal(good.view, 'front');
  assert.deepEqual(Object.keys(good.metrics).sort(), [...FRONT_METRICS].sort());
  assert.ok(good.metrics.elbowAlignment.value < 12, `alignment ${good.metrics.elbowAlignment.value}`);
  assert.notEqual(good.metrics.guideHand.status, 'needs-work');
  const flared = analyzeShooting(makeFrontShot({ setTilt: 40 }).frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(flared.metrics.elbowAlignment.value > good.metrics.elbowAlignment.value + 15, `${flared.metrics.elbowAlignment.value}`);
  const lefty = analyzeShooting(makeFrontShot({ rightHanded: false }).frames, { aspect: ASPECT, fps: 60, config });
  assert.equal(lefty.hand, 'left'); assert.equal(lefty.view, 'front');
  const rh = good.metrics.releaseHeight.value;
  assert.ok(rh > 0.9 && rh < 1.6, `release height ${rh}`);
});

test('static front pose with raised arms is analysed with low confidence', () => {
  const sh = makeFrontShot({});
  for (const f of sh.frames) { const S = f.lm[12]; f.lm[14] = { ...S, y: S.y - 0.1 }; f.lm[16] = { ...S, y: S.y - 0.2 }; f.lm[20] = { ...S, y: S.y - 0.24 }; }
  const r = analyzeShooting(sh.frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(r.ok && r.weakShot);
});

test('release height is measured where the ball leaves the hand', () => {
  const { s, r } = run({});
  near(r.phases.release, s.releaseFrame, 8, 'ball release frame near the arm extension');
});

test('a standing clip is flagged as a doubtful shot or rejected, never trusted', () => {
  const s = makeShot({ kneeFlex: 5, releaseT: 99, dipStart: 99, dipEnd: 99.1, riseEnd: 99.2, landT: 99.3 });
  const r = analyzeShooting(s.frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(!r.ok || r.weakShot);
});

test('stance: measured from the front only (from the side the gap points at the camera); too close is punished harder than too wide', () => {
  const front = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  near(front.metrics.stance.value, 0.57, 0.08, 'feet 0.08 apart, shoulders 0.14 apart');
  assert.notEqual(front.metrics.stance.status, 'good'); // too narrow for the zone
  const side = run({}).r;
  assert.equal(side.metrics.stance, undefined, 'the side view leaves stance blank instead of guessing from depth');
  assert.ok(!SIDE_METRICS.includes('stance') && FRONT_METRICS.includes('stance'));
  const rg = config.moves.shooting.ranges.stance;
  const tooClose = scoreValue(rg.good[0] - 0.3, rg), tooWide = scoreValue(rg.good[1] + 0.3, rg);
  assert.ok(tooClose.score < tooWide.score, `close ${tooClose.score} vs wide ${tooWide.score}`);
  assert.equal(scoreValue(1.2, rg).status, 'good');
});

test('a quick shot is never penalised for tempo', () => {
  const rg = config.moves.shooting.ranges.tempo;
  for (const t of [0.2, 0.35, 0.5, 0.8, 1.2]) assert.equal(scoreValue(t, rg).status, 'good', `${t}s`);
  assert.notEqual(scoreValue(1.8, rg).status, 'good');
  const quick = run({ dipStart: 1.3, dipEnd: 1.5, riseEnd: 1.7 }).r;
  assert.equal(quick.metrics.tempo.status, 'good', `${quick.metrics.tempo.value}`);
});

test('release is the arm straightening', () => {
  const { s, r } = run({});
  near(r.phases.release, s.releaseFrame, 4, 'release near full extension');
  const el = r.phases;
  assert.ok(el.release > el.set, 'release after the set point');
});

test('leg-to-arm timing: arm finishing long after the legs is flagged, a close finish is good', () => {
  const smooth = run({}).r, late = run({ releaseT: 2.1, landT: 2.5 }).r;
  assert.ok(Number.isFinite(smooth.metrics.legArmTiming.value));
  assert.ok(late.metrics.legArmTiming.value > smooth.metrics.legArmTiming.value + 0.1, `${late.metrics.legArmTiming.value} vs ${smooth.metrics.legArmTiming.value}`);
  assert.equal(late.metrics.legArmTiming.signed > 0, true);
  assert.equal(late.metrics.legArmTiming.status === 'good', false);
  const front = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(Number.isFinite(front.metrics.legArmTiming.value));
});

test('every metric of every view has copy, advice, a range and a weight', () => {
  const ranges = config.moves.shooting.ranges, weights = config.moves.shooting.weights;
  const metrics = Object.fromEntries([...new Set([...SIDE_METRICS, ...FRONT_METRICS])].map((id) => [id, { value: 1, unit: '', status: 'borderline', score: 50, signed: 1, note: '' }]));
  const adv = templateAdvice('shooting', metrics, ranges);
  for (const id of Object.keys(metrics)) { assert.ok(ranges[id] && id in weights, id); assert.ok(adv[id].length > 10, id); }
  for (const id of [...Object.keys(ranges), ...Object.keys(weights)]) assert.ok(id in metrics, `${id} is in the config but is not a metric any more`);
});

test('scoreValue: good / borderline / needs-work', () => {
  const rg = { good: [45, 55], tolerance: 10 };
  assert.equal(scoreValue(50, rg).status, 'good');
  assert.equal(scoreValue(40, rg).status, 'borderline');
  assert.equal(scoreValue(20, rg).status, 'needs-work');
  assert.equal(scoreValue(50, rg).score, 100);
});

test('scoring is strict: 100 only in the ideal zone, 85 at the edge of good, 50 at the edge of the tolerance', () => {
  const rg = { good: [45, 58], ideal: [49, 55], tolerance: 10 };
  assert.equal(scoreValue(52, rg).score, 100);
  assert.equal(scoreValue(45, rg).score, 85); assert.equal(scoreValue(58, rg).score, 85);
  assert.equal(scoreValue(47, rg).status, 'good'); assert.ok(scoreValue(47, rg).score < 100 && scoreValue(47, rg).score > 85);
  assert.equal(scoreValue(35, rg).score, 50); assert.equal(scoreValue(25, rg).score, 0);
  const tempo = config.moves.shooting.ranges.tempo; // less is better: quick shots get full marks, 1.2 s is the edge
  assert.equal(scoreValue(0.5, tempo).score, 100); assert.equal(scoreValue(1.2, tempo).score, 85); assert.equal(scoreValue(1.3, tempo).status, 'borderline');
  assert.deepEqual(config.moves.shooting.ranges.elbowAlignment.good, [0, 12]);
  // a shot that is merely inside every green zone, at the edges, cannot reach 90
  const edge = { a: { status: 'good', score: 85 }, b: { status: 'good', score: 85 }, c: { status: 'good', score: 85 } };
  assert.equal(headlineScore(edge, {}), 85);
});

const person = (cx, h, v = 0.9) => Array.from({ length: 33 }, (_, i) => ({ x: cx + ((i % 5) - 2) * 0.01, y: 0.1 + (i / 32) * h, z: 0, v }));

test('subject selection ignores a small peripheral person', () => {
  const per = Array.from({ length: 60 }, () => [person(0.5, 0.6), person(0.9, 0.2)]);
  const sub = selectSubject(per, per.map((_, i) => i / 60), config);
  assert.equal(sub.secondShare, 0);
  assert.deepEqual(assessTracking({ subject: sub, total: 60, brightness: 120 }, config), { fatal: null, notes: [] });
});

test('a large central second person is a note, not a rejection', () => {
  const per = Array.from({ length: 60 }, () => [person(0.45, 0.6), person(0.6, 0.55)]);
  const sub = selectSubject(per, per.map((_, i) => i / 60), config);
  const a = assessTracking({ subject: sub, total: 60, brightness: 120 }, config);
  assert.equal(a.fatal, null); assert.deepEqual(a.notes.map((x) => x.code), ['multiple']);
});

test('false detections are ignored; a small or dark clip is accepted with notes; nobody at all is rejected', () => {
  const flat = Array.from({ length: 33 }, (_, i) => ({ x: 0.5 + (i % 3) * 0.01, y: 0.4 + (i % 2) * 0.01, z: 0, v: 0.9 })); // everything in one spot
  const sub0 = selectSubject(Array.from({ length: 60 }, () => [flat]), Array.from({ length: 60 }, (_, i) => i / 60), config);
  assert.equal(sub0.withPerson, 0);
  const tiny = Array.from({ length: 60 }, () => [person(0.5, 0.08)]);
  const small = assessTracking({ subject: selectSubject(tiny, tiny.map((_, i) => i / 60), config), total: 60, brightness: 10 }, config);
  assert.equal(small.fatal, null); assert.deepEqual(small.notes.map((x) => x.code).sort(), ['dark', 'too-small']);
  const far = Array.from({ length: 60 }, () => [person(0.5, 0.2)]); // filmed from the stands: small but usable
  assert.deepEqual(assessTracking({ subject: selectSubject(far, far.map((_, i) => i / 60), config), total: 60, brightness: 120 }, config), { fatal: null, notes: [] });
  const big = Array.from({ length: 60 }, () => [person(0.5, 0.7)]);
  assert.deepEqual(assessTracking({ subject: selectSubject(big, big.map((_, i) => i / 60), config), total: 60, brightness: 120 }, config), { fatal: null, notes: [] });
  const none = selectSubject(Array.from({ length: 60 }, () => []), big.map((_, i) => i), config);
  assert.equal(assessTracking({ subject: none, total: 60, brightness: 120 }, config).fatal.code, 'no-person');
});

test('distant players get a zoom crop, close players do not; landmarks map back', () => {
  const far = person(0.4, 0.15), near = person(0.5, 0.7);
  assert.equal(subjectCrop([near, near], 1920, 1080), null);
  const c = subjectCrop([far, far, far], 1920, 1080);
  assert.ok(c && c.w < 0.9 && c.h < 0.9, JSON.stringify(c));
  // the crop contains the whole player
  for (const p of far) { assert.ok(p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h); }
  const back = uncropLandmarks(far.map((p) => ({ ...p, x: (p.x - c.x) / c.w, y: (p.y - c.y) / c.h })), c);
  near_(back[0].x, far[0].x, 1e-9); near_(back[20].y, far[20].y, 1e-9);
  const aspect = (c.w * 1920) / (c.h * 1080);
  assert.ok(aspect >= 0.59 && aspect <= 1.61, `crop aspect ${aspect}`);
});

test('only a hopeless frame rate is blocked', () => {
  assert.equal(checkFps(30, config).level, 'warn');
  assert.match(checkFps(30, config).message, /30 fps.*low quality.*60 fps or higher/);
  assert.equal(checkFps(60, config), null);
  assert.equal(checkFps(59.94, config), null);
  assert.equal(checkFps(58.2, config), null);
  assert.equal(checkFps(45, config).level, 'warn');
  assert.equal(checkFps(24, config).level, 'warn');
  assert.equal(checkFps(8, config).level, 'block');
  assert.match(checkFps(8, config).message, /8 fps.*at least 10 fps/);
});

test('calibration range = observed range plus buffer', () => {
  const r = rangeFromValues([50, 54, 52, 58]);
  assert.ok(r.good[0] < 50 && r.good[1] > 58 && r.tolerance > 0);
  const many = rangesFromClips([run({}).r, run({ kneeFlex: 50 }).r], ['kneeDip']);
  assert.ok(many.kneeDip.good[0] < 40 && many.kneeDip.good[1] > 50);
});

test('template advice is personalised with the number; LLM failure falls back', async () => {
  const { r } = run({ releaseDirDeg: 25 });
  const ranges = config.moves.shooting.ranges;
  const adv = templateAdvice('shooting', r.metrics, ranges);
  assert.match(adv.releaseAngle, new RegExp(`${Math.round(r.metrics.releaseAngle.value)}°`));
  const out = await personalisedAdvice('shooting', r.metrics, ranges, { llm: { proxyUrl: 'http://x', timeoutMs: 50 } }, async () => { throw new Error('down'); });
  assert.deepEqual(out, adv);
  const ok = await personalisedAdvice('shooting', r.metrics, ranges, { llm: { proxyUrl: 'http://x' } }, async () => ({ ok: true, json: async () => ({ advice: { tempo: 'Slow down, champ.' } }) }));
  assert.equal(ok.tempo, 'Slow down, champ.'); assert.equal(ok.kneeDip, adv.kneeDip);
});

test('overall score bands', () => {
  assert.equal(scoreBand(70), 'good'); assert.equal(scoreBand(69), 'borderline');
  assert.equal(scoreBand(50), 'borderline'); assert.equal(scoreBand(49), 'needs-work');
});

test('report crop keeps the whole player, is never a narrow strip and stays inside the frame', () => {
  // a thin figure standing in the middle of a portrait 540x960 frame
  const lm = Array.from({ length: 33 }, () => null);
  [[0, .5, .3], [11, .46, .36], [12, .54, .36], [23, .47, .52], [24, .53, .52], [27, .47, .8], [28, .53, .8], [31, .46, .82], [32, .54, .82]]
    .forEach(([i, x, y]) => { lm[i] = { x, y, v: 1 }; });
  const box = playerBox([lm]);
  assert.ok(box.y < .3 && box.y + box.h > .82, 'head and feet inside the crop');
  const c = fitAspect(box, 540, 960);
  assert.ok(c.w / c.h >= 0.8 - 1e-9, `aspect ${c.w / c.h} is at least 4:5`);
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 540 + 1e-6 && c.y + c.h <= 960 + 1e-6, 'inside the frame');
  assert.deepEqual(playerBox([null]), { x: 0, y: 0, w: 1, h: 1 }); // nobody tracked: whole frame
});

test('momentum projection and rubber-band resistance', () => {
  assert.equal(project(0), 0);
  assert.ok(project(1000) > 400 && project(-1000) < -400, 'a fast flick travels far, in its own direction');
  assert.ok(rubberband(100, 400) < 100 && rubberband(400, 400) < rubberband(800, 400), 'resists, but never stops dead');
});

// ---- journey: levels, weekly streak, rest weeks, milestones
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const mondayOf = (k) => at(2026, 1, 5) + k * 7 * 864e5; // 2026-01-05 is a Monday; k weeks later (noon, so DST is safe)
const inWeeks = (...ks) => ks.flatMap((k) => (Array.isArray(k) ? Array.from({ length: k[1] }, () => ({ ts: mondayOf(k[0]) })) : [{ ts: mondayOf(k) }]));

test('weeks run Monday to Sunday in local time, across New Year and a clock change', () => {
  assert.equal(weekIndex(at(2026, 3, 1, 23)), weekIndex(at(2026, 2, 23, 1)), 'Sunday night is in the same week as the Monday before');
  assert.equal(weekIndex(at(2026, 3, 2, 1)), weekIndex(at(2026, 3, 1, 23)) + 1, 'Monday morning starts the next week');
  assert.equal(weekIndex(at(2026, 3, 30, 9)), weekIndex(at(2026, 3, 28, 9)) + 1, 'across the spring clock change');
  assert.equal(weekIndex(at(2026, 10, 26, 9)), weekIndex(at(2026, 10, 24, 9)) + 1, 'across the autumn clock change');
  assert.equal(weekIndex(at(2027, 1, 1)), weekIndex(at(2026, 12, 28)), 'New Year inside one week');
});

test('levels: thresholds, and at most 3 videos a week count', () => {
  assert.equal(rankFor(0).name, null); assert.equal(rankFor(0).next, 'Noobie'); assert.equal(rankFor(0).toNext, 1);
  for (const l of LADDER) { assert.equal(rankFor(l.at).name, l.name); if (l.at > 1) assert.notEqual(rankFor(l.at - 1).name, l.name); }
  assert.equal(rankFor(26).next, null); assert.equal(rankFor(99).name, 'Elite');
  assert.equal(LADDER[LADDER.length - 1].at, 26, 'Elite is 26 videos: about 6 months at one a week');
  const j = journey(inWeeks([0, 5], 1), mondayOf(1));
  assert.equal(j.total, 6); assert.equal(j.counted, 4, '5 in one week count as 3, plus 1');
  assert.equal(j.rank.name, 'Hooper'); assert.equal(j.rank.next, 'Baller'); assert.equal(j.rank.toNext, 3);
});

test('weekly streak: grows, earns rest weeks, survives a miss with one, resets without', () => {
  const four = journey(inWeeks(0, 1, 2, 3), mondayOf(3));
  assert.equal(four.streak, 4); assert.equal(four.restHeld, 1, 'rest week earned at 4 in a row');
  const kept = journey(inWeeks(0, 1, 2, 3, 5), mondayOf(5));
  assert.equal(kept.streak, 5); assert.equal(kept.restHeld, 0, 'week 4 missed, rest week used, streak kept (not grown)');
  assert.equal(kept.weeks.find((w) => w.index === weekIndex(mondayOf(4))).state, 'rest');
  const broke = journey(inWeeks(0, 1, 2, 3, 6), mondayOf(6));
  assert.equal(broke.streak, 1, 'two misses with one rest week: back to the start'); assert.equal(broke.best, 4);
  const many = journey(inWeeks(...Array.from({ length: 16 }, (_, k) => k)), mondayOf(15));
  assert.equal(many.restHeld, 2, 'never more than 2 rest weeks held'); assert.equal(many.streak, 16);
  const pending = journey(inWeeks(0, 1), mondayOf(2));
  assert.equal(pending.streak, 2, 'the current week has not ended, so it does not break the streak');
  assert.equal(pending.weeks[pending.weeks.length - 1].state, 'current');
  assert.equal(journey([], mondayOf(0)).streak, 0);
});

test('milestones: first, fifth, level-up and week-in-a-row fire exactly once', () => {
  const step = (prev, add, now) => milestones(journey(prev, now), journey([...prev, ...add], now));
  const one = step([], inWeeks(0), mondayOf(0));
  assert.ok(one.first && one.big); assert.deepEqual(one.rankUp, { from: null, to: 'Noobie' });
  const four = inWeeks(0, 1, 2, 3);
  const fifth = step(four, inWeeks(4), mondayOf(4));
  assert.ok(fifth.fifth && !fifth.first); assert.equal(fifth.weekInRow.n, 5);
  assert.ok(!fifth.rankUp, 'still Hooper at 5');
  const sixth = step([...four, ...inWeeks(4)], inWeeks(4), mondayOf(4));
  assert.ok(!sixth.fifth && !sixth.weekInRow && !sixth.rankUp, 'second video of the same week is not a new week in a row');
  const baller = step(inWeeks(0, 1, 2, 3, 4, 5), inWeeks(6), mondayOf(6));
  assert.deepEqual(baller.rankUp, { from: 'Hooper', to: 'Baller' }, 'level-up exactly at 7');
  const quiet = step(inWeeks(0, 1, 2, 3, 4, 5, 6, 7), inWeeks(8), mondayOf(8));
  assert.ok(!quiet.big, `nothing big at 9 videos: ${JSON.stringify(quiet)}`);
  assert.ok(step(inWeeks(0, 1, 2), inWeeks(3), mondayOf(3)).restEarned, 'rest week earned is reported');
});

test('clearing the scores keeps the practice log, so level and streak survive', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const store = await import('../js/store.js');
  // a session saved before the log existed (only in swish.sessions), and two saved normally
  mem.set('swish.sessions', JSON.stringify([{ id: 'old', ts: mondayOf(0), profileId: 'p1', move: 'shooting', score: 50, metrics: {} }]));
  store.addSession({ id: 'a', ts: mondayOf(1), profileId: 'p1', move: 'shooting', score: 60, metrics: {} });
  store.addSession({ id: 'b', ts: mondayOf(2), profileId: 'p1', move: 'shooting', score: 70, metrics: {} });
  store.addSession({ id: 'other', ts: mondayOf(2), profileId: 'p2', move: 'shooting', score: 70, metrics: {} });
  assert.equal(store.activityForProfile('p1').length, 3);
  assert.equal(journey(store.activityForProfile('p1'), mondayOf(2)).streak, 3);
  assert.equal(store.clearSessions('p1', 'shooting'), true);
  assert.equal(store.sessionsFor('p1', 'shooting').length, 0, 'scores and charts are gone');
  const kept = store.activityForProfile('p1');
  assert.equal(kept.length, 3, 'practice log kept, including the session that predates it');
  assert.equal(journey(kept, mondayOf(2)).streak, 3); assert.equal(journey(kept, mondayOf(2)).total, 3);
  assert.equal(store.activityForProfile('p2').length, 1, 'other profiles untouched');
  store.addSession({ id: 'c', ts: mondayOf(3), profileId: 'p1', move: 'shooting', score: 80, metrics: {} });
  assert.equal(journey(store.activityForProfile('p1'), mondayOf(3)).streak, 4, 'the streak carries on after a clear');
});

test('every card stays: a metric the view cannot measure is blank, not removed, and does not count toward the score', () => {
  assert.deepEqual([...displayMetrics('side')].sort(), [...SIDE_METRICS].sort());
  assert.deepEqual([...displayMetrics('front')].sort(), [...SHOOTING_METRICS].sort());
  const front = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  assert.deepEqual([...front.metricIds].sort(), [...SHOOTING_METRICS].sort());
  const blank = blankMetric('releaseAngle', 12);
  assert.equal(blank.status, 'unknown'); assert.ok(Number.isNaN(blank.value)); assert.equal(blank.frame, 12);
  assert.match(blank.reason, /side/);
  assert.match(blankMetric('elbowAlignment', 0).reason, /front/);
  const weights = config.moves.shooting.weights;
  assert.equal(headlineScore({ ...front.metrics, releaseAngle: blank }, weights), headlineScore(front.metrics, weights));
  const adv = templateAdvice('shooting', { releaseAngle: blank }, config.moves.shooting.ranges);
  assert.equal(adv.releaseAngle, blank.reason);
});

test('level screen can say why you are stuck: this week is capped, extra videos are counted as ignored', () => {
  const stuck = journey(inWeeks([0, 9]), mondayOf(0)); // nine videos in one week
  assert.equal(stuck.counted, 3); assert.equal(stuck.rank.name, 'Rookie'); assert.equal(stuck.rank.toNext, 1);
  assert.equal(stuck.capped, true); assert.equal(stuck.thisWeekCounted, 3); assert.equal(stuck.ignored, 6);
  const next = journey(inWeeks([0, 9]), mondayOf(1)); // the following week nothing is capped and the level can move
  assert.equal(next.capped, false); assert.equal(next.thisWeekCounted, 0); assert.equal(next.ignored, 6);
  const two = journey(inWeeks([0, 2]), mondayOf(0));
  assert.equal(two.capped, false); assert.equal(two.ignored, 0);
});

test('shooting hand: detected from the front, taken from the profile side-on, and the label always matches the arm used', () => {
  const front = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  assert.equal(front.hand, 'right'); assert.equal(front.handSource, 'detected'); assert.equal(front.handAmbiguous, false);
  const lefty = analyzeShooting(makeFrontShot({ rightHanded: false }).frames, { aspect: ASPECT, fps: 60, config });
  assert.equal(lefty.hand, 'left'); assert.equal(lefty.handSource, 'detected');
  const side = analyzeShooting(makeShot({}).frames, { aspect: ASPECT, fps: 60, config: { ...config, hand: 'left' } });
  assert.equal(side.hand, 'left'); assert.equal(side.handSource, 'profile'); assert.equal(side.handAmbiguous, false);
  assert.equal(side.guideHand, 'right');
  const sideAuto = analyzeShooting(makeShot({}).frames, { aspect: ASPECT, fps: 60, config: { ...config, hand: null } });
  assert.equal(sideAuto.handAmbiguous, true); assert.ok(['left', 'right'].includes(sideAuto.hand));
});

test('release height is the highest point the hand reaches, not just the release frame', () => {
  const { r } = run({});
  const m = r.metrics.releaseHeight;
  assert.ok(m.frame >= r.phases.release - 6 && m.frame <= r.phases.release + 18, `frame ${m.frame} vs release ${r.phases.release}`);
  assert.ok(Number.isFinite(m.value) && m.value > 1, `height ${m.value}`);
});

test('front or side is decided from shoulder width with a cut-off taken from real clips, and an angled camera is flagged', () => {
  const squeeze = (k) => makeFrontShot({}).frames.map((f) => ({ ...f, lm: f.lm && f.lm.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * k })) }));
  const at = (k) => analyzeShooting(squeeze(k), { aspect: ASPECT, fps: 60, config });
  assert.equal(at(0.2).view, 'side'); assert.equal(at(0.2).viewAngled, false);
  assert.equal(at(0.55).view, 'front'); // about 0.45: turned well toward the camera, like the angled pro clips (0.49-0.69)
  assert.equal(at(0.42).view, 'front'); assert.equal(at(0.42).viewAngled, true, 'near the cut-off, so the report says so');
  assert.equal(at(1).viewAngled, false);
  assert.equal(config.viewSplit, 0.32);
});

test('calibration helper copes with front-view clips (side-only metrics missing) and proposes an ideal zone', () => {
  const front = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  const side = analyzeShooting(makeShot({}).frames, { aspect: ASPECT, fps: 60, config });
  const r = rangesFromClips([front, side], ['releaseAngle', 'elbowAlignment', 'tempo']);
  assert.ok(r.releaseAngle && r.elbowAlignment, 'a metric only one clip has still gets a range');
  assert.ok(r.tempo.ideal[0] <= r.tempo.ideal[1] && r.tempo.ideal[0] >= r.tempo.good[0]);
});

test('headline weights each metric by tracking confidence, so a guess barely moves the score', () => {
  const cw = config.moves.shooting.confidenceWeights, w = {};
  assert.deepEqual(cw, { high: 1, medium: 0.7, low: 0.25 });
  const m = (score, confidence) => ({ status: 'good', score, confidence });
  assert.equal(headlineScore({ a: m(100, 'high'), b: m(40, 'high') }, w, cw), 70);
  const guessed = headlineScore({ a: m(100, 'high'), b: m(40, 'low') }, w, cw); // 100*1 + 40*.25 over 1.25
  assert.equal(guessed, 88); assert.ok(guessed > 70, 'the same bad number counts for much less when it was a guess');
  assert.equal(headlineScore({ a: m(100, 'high'), b: m(40, 'medium') }, w, cw), Math.round((100 + 40 * 0.7) / 1.7));
  assert.equal(headlineScore({ a: m(80, 'low'), b: m(60, 'low') }, w, cw), 70, 'all low confidence still averages normally');
  assert.equal(headlineScore({ a: { status: 'good', score: 80 } }, w, cw), 80, 'no confidence field counts fully');
  assert.equal(headlineScore({ a: m(80, 'high'), b: { status: 'unknown', score: 0, confidence: 'high' } }, w, cw), 80, 'blanks never count');
  // a metric the camera barely saw cannot sink an otherwise good score
  const w3 = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 };
  const seven = Object.fromEntries(Object.keys(w3).map((k) => [k, m(90, 'high')]));
  const base = headlineScore(seven, w3, cw);
  assert.ok(base - headlineScore({ ...seven, g: m(0, 'low') }, w3, cw) < 14, 'a zero on a low-confidence metric costs under 14 points');
});

// ---- follow camera for the live view
const bodyAt = (cx, cy, h, w = h * 0.4) => Array.from({ length: 33 }, (_, i) => ({ x: cx - w / 2 + ((i % 5) / 4) * w, y: cy - h / 2 + (i / 32) * h, v: 0.9 }));
const settle = (cam, t, steps = 120) => { for (let k = 0; k < steps; k++) stepCam(cam, t, 1 / 30); return cam; };

test('follow camera: a player standing off to one side ends up in the middle of the box, zoomed in', () => {
  const lm = bodyAt(0.22, 0.55, 0.5); // tall player standing well to the left of a portrait frame
  const t = camTarget(lm);
  assert.ok(t.s < 1 && t.s >= 0.42, `zoom ${t.s}`);
  const cam = settle({ cx: 0.5, cy: 0.5, s: 1 }, t);
  const r = cropRect(cam, 540, 960);
  const mid = (r.x + r.w / 2) / 540; // where the window is centred, in the frame
  near(mid, 0.22, 0.04, 'window centred on the player');
  assert.ok(r.x >= -0.18 * r.w - 1e-6, 'never slides further past the edge than the overscan');
  const playerInBox = (0.22 * 540 - r.x) / r.w; // 0.5 = dead centre of the box
  assert.ok(Math.abs(playerInBox - 0.5) < 0.2, `player sits at ${playerInBox.toFixed(2)} of the box width`);
});

test('follow camera: starts as the whole frame, glides rather than jumps, never zooms past the floor', () => {
  const t = camTarget(bodyAt(0.7, 0.5, 0.2)); // small, distant player
  assert.equal(t.s, 0.42);
  const cam = { cx: 0.5, cy: 0.5, s: 1 };
  stepCam(cam, t, 1 / 30);
  assert.ok(cam.s < 1 && cam.s > 0.95, 'first step is gentle');
  assert.ok(Math.abs(cam.cx - 0.5) < 0.04, 'and so is the pan');
  settle(cam, t);
  near(cam.cx, 0.7, 0.01, 'then it arrives'); near(cam.s, 0.42, 0.01, 'zoom arrives');
  const before = { ...cam }; stepCam(cam, null, 1); assert.deepEqual(cam, before, 'no detection: the camera holds still');
});

test('follow camera: a player filling the frame is not zoomed, and unseen bodies give no target', () => {
  assert.equal(camTarget(bodyAt(0.5, 0.5, 0.9)).s, 1);
  assert.equal(camTarget(null), null);
  assert.equal(camTarget(Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 0.05 }))), null);
  const r = cropRect({ cx: 0.5, cy: 0.5, s: 1 }, 540, 960);
  assert.deepEqual([r.x, r.y, r.w, r.h], [0, 0, 540, 960]);
});

test('release angle: only a flat release is penalised, a higher arc is never wrong', () => {
  const rg = config.moves.shooting.ranges.releaseAngle;
  assert.deepEqual(rg.good, [45, 90]);
  for (const v of [55, 62, 70, 80, 90]) { const r = scoreValue(v, rg); assert.equal(r.score, 100, `${v} deg`); assert.equal(r.status, 'good'); }
  assert.ok(scoreValue(46, rg).score >= 85 && scoreValue(46, rg).score < 100, 'just inside the line is good but not full marks');
  assert.equal(scoreValue(45, rg).score, 85);
  assert.equal(scoreValue(43, rg).status, 'borderline'); assert.ok(scoreValue(43, rg).score < 85);
  assert.equal(scoreValue(42, rg).score, 50); assert.equal(scoreValue(40, rg).score < 20, true, 'a clearly flat release is near zero'); assert.equal(scoreValue(20, rg).status, 'needs-work');
  const flat = { id: 'releaseAngle', value: 30, unit: 'deg', ...scoreValue(30, rg) };
  assert.notEqual(flat.status, 'good');
  const adv = templateAdvice('shooting', { releaseAngle: flat }, config.moves.shooting.ranges).releaseAngle;
  assert.match(adv, /45° or steeper/); assert.doesNotMatch(adv, /58/);
});

// ---- camera pan estimation (the phone follows the player)
const W0 = 72, H0 = 128;
/** A textured "scene" that can be sampled at any sub-pixel offset, so slow pans are exact in the test. */
const scene = (x, y) => 128 + 40 * Math.sin(x * 0.31 + 1) * Math.cos(y * 0.23) + 35 * Math.sin(x * 0.11 + y * 0.17) + 25 * Math.cos(x * 0.47 - y * 0.29 + 2);
const frameAt = (shiftPx, player = null) => { // content moved right by shiftPx
  const g = new Uint8Array(W0 * H0);
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) g[y * W0 + x] = Math.max(0, Math.min(255, scene(x - shiftPx, y)));
  if (player) for (let y = player.y0; y < player.y1; y++) for (let x = player.x0; x < player.x1; x++) g[y * W0 + x] = (x * 7 + y * 13) % 255; // a moving "person", very different from the background
  return g;
};
test('camera pan: a slow pan is measured at close to its true size (consecutive frames alone would read about half)', () => {
  const n = 60, per = 0.35; // 0.35 px a frame: 21 px in all, 29% of the width
  const grays = Array.from({ length: n }, (_, i) => frameAt(i * per));
  const cam = camPath(grays, null, W0, H0);
  assert.equal(cam.moved, true);
  near(cam.x[n - 1], (n - 1) * per / W0, 0.02, 'total pan as a fraction of the width');
  near(cam.x[30], 30 * per / W0, 0.015, 'and halfway');
  near(cam.y[n - 1], 0, 0.01, 'no vertical movement');
});

test('camera pan: a fixed camera gives exactly zero, frames that were not analysed are bridged, the player is ignored', () => {
  const still = Array.from({ length: 30 }, () => frameAt(0));
  const c0 = camPath(still, null, W0, H0);
  assert.equal(c0.moved, false); assert.ok(c0.x.every((v) => v === 0));
  const grays = Array.from({ length: 50 }, (_, i) => (i % 3 === 0 ? frameAt(i * 0.5) : null)); // only every third frame analysed
  const cam = camPath(grays, null, W0, H0);
  near(cam.x[48], 48 * 0.5 / W0, 0.02, 'gaps do not lose the pan');
  const box = { x0: 0.35, x1: 0.65, y0: 0.3, y1: 0.8 }, pl = { x0: 25, x1: 47, y0: 38, y1: 102 };
  const withPlayer = Array.from({ length: 40 }, (_, i) => frameAt(i * 0.4, { x0: pl.x0 + (i % 5), x1: pl.x1 + (i % 5), y0: pl.y0, y1: pl.y1 }));
  const boxes = withPlayer.map((_, i) => ({ x0: box.x0 + (i % 5) / W0, x1: box.x1 + (i % 5) / W0, y0: box.y0, y1: box.y1 }));
  near(camPath(withPlayer, boxes, W0, H0).x[39], 39 * 0.4 / W0, 0.03, 'with the player masked out');
  assert.deepEqual(maskOf(null, 4, 4), new Uint8Array(16));
  const s = estimateShift(frameAt(0), frameAt(3), W0, H0, null, null); near(s.dx, 3, 0.2, 'whole-pixel shift'); near(s.dy, 0, 0.2, 'no vertical');
});

test('forward drift is measured in the world: a player who stands still in the picture while the camera pans has drifted', () => {
  const sh = makeShot({});
  const base = analyzeShooting(sh.frames, { aspect: ASPECT, fps: 60, config });
  const frames = sh.frames.map((f, i) => ({ ...f, cam: { x: (i / sh.frames.length) * 0.6, y: 0 } })); // the camera panned 60% of the width over the clip
  const panned = analyzeShooting(frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(Number.isFinite(base.metrics.forwardDrift.value) && Number.isFinite(panned.metrics.forwardDrift.value));
  assert.ok(Math.abs(panned.metrics.forwardDrift.value - base.metrics.forwardDrift.value) > 0.15, `${base.metrics.forwardDrift.value} vs ${panned.metrics.forwardDrift.value}`);
  const g = panned.metrics.forwardDrift;
  assert.ok(g.ghost && g.ghost.length === 33 && Number.isInteger(g.startFrame), 'the starting pose comes with the metric so the card can show both');
  assert.ok(g.startFrame < g.frame, 'start is before landing');
});

let passed = 0;
for (const [name, fn] of queue) { await fn(); passed++; console.log('ok -', name); }
console.log(`\n${passed} tests passed`);
