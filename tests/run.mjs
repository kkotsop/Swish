import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeShooting, headlineScore, scoreValue, SIDE_METRICS, FRONT_METRICS } from '../js/shooting.js';
import { makeShot, makeFrontShot, ASPECT } from './synth.js';
import { selectSubject, assessTracking, checkFps, poseBox } from '../js/precheck.js';
import { subjectCrop, uncropLandmarks } from '../js/crop.js';
import { rangeFromValues, rangesFromClips } from '../js/calibrate.js';
import { templateAdvice, personalisedAdvice, scoreBand } from '../js/coaching.js';
import { playerBox, fitAspect } from '../js/crop.js';
import { project, rubberband } from '../js/motion.js';

const config = JSON.parse(fs.readFileSync(new URL('../config/settings.json', import.meta.url)));
const run = (o) => { const s = makeShot(o); return { s, r: analyzeShooting(s.frames, { aspect: ASPECT, fps: 60, config }) }; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}±${tol}`);
const near_ = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

test('right-handed shot: phases, hand, direct metrics', () => {
  const { s, r } = run({});
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.hand, 'right'); assert.equal(r.facing, 1); assert.ok(!r.handAmbiguous);
  near(r.phases.release, s.releaseFrame, 4, 'release frame');
  near(r.phases.set, s.setFrame, 8, 'set frame');
  near(r.phases.bottom, s.bottomFrame, 4, 'bottom frame');
  near(r.metrics.kneeDip.value, 40, 4, 'knee flexion');
  near(r.metrics.elbowAngle.value, 90, 8, 'elbow at set');
  near(r.metrics.tempo.value, 1.75 - 1.0, 0.18, 'tempo');
  near(r.metrics.forwardDrift.value, 0.1, 0.05, 'drift');
  assert.equal(r.view, 'side');
  assert.deepEqual(Object.keys(r.metrics).sort(), [...SIDE_METRICS].sort());
  assert.equal(r.metrics.followThrough.status, 'good');
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
  near(lo.metrics.elbowAngle.value, hi.metrics.elbowAngle.value, 8, 'elbow 30 vs 60');
  near(lo.metrics.tempo.value, hi.metrics.tempo.value, 0.15, 'tempo 30 vs 60');
  near(lo.metrics.forwardDrift.value, hi.metrics.forwardDrift.value, 0.06, 'drift 30 vs 60');
  near(lo.metrics.releaseAngle.value, hi.metrics.releaseAngle.value, 12, 'release angle 30 vs 60');
  near(lo.metrics.releaseHeight.value, hi.metrics.releaseHeight.value, 0.05, 'release height 30 vs 60');
});

test('release angle is never negative and elbow-at-set is a real bent elbow', () => {
  for (const o of [{}, { releaseDirDeg: 20 }, { releaseDirDeg: 80 }, { rightHanded: false, mirror: true }, { fps: 30 }]) {
    const { r } = run(o.fps ? {} : o);
    const rr = o.fps ? analyzeShooting(makeShot(o).frames, { aspect: ASPECT, fps: o.fps, config }) : r;
    assert.ok(rr.metrics.releaseAngle.value > 0 && rr.metrics.releaseAngle.value <= 90, `release angle ${rr.metrics.releaseAngle.value}`);
    assert.ok(rr.metrics.elbowAngle.value < 110, `elbow ${rr.metrics.elbowAngle.value}`);
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

test('a nearly straight elbow at the set point is never trusted (low confidence)', () => {
  for (const setElbow of [90, 130, 160, 176]) {
    const r = run({ setElbow }).r;
    if (!r.ok) continue;
    if (r.metrics.elbowAngle.value > 140) assert.equal(r.metrics.elbowAngle.confidence, 'low', `set ${setElbow}`);
  }
});

test('knee dip is the deepest bend of the shot', () => {
  const a = run({ kneeFlex: 55 }).r;
  near(a.metrics.kneeDip.value, 55, 4, 'knee at lowest point');
  near(a.phases.bottom, 84, 6, 'bottom frame ~ end of the dip');
});

test('guide hand: near the ball is good, hanging low is flagged', () => {
  const near_ = run({ guideMode: 'near' }).r, low = run({ guideMode: 'low' }).r;
  assert.equal(near_.metrics.guideHand.status, 'good');
  assert.ok(low.metrics.guideHand.value > near_.metrics.guideHand.value + 0.8, `${low.metrics.guideHand.value} vs ${near_.metrics.guideHand.value}`);
  assert.notEqual(low.metrics.guideHand.status, 'good');
  assert.equal(near_.guideHand, 'left'); // right-handed shooter -> off hand is the left
});

test('front view is detected and measures only what it can (elbow alignment, off hand, ...)', () => {
  const good = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(good.ok, JSON.stringify(good)); assert.equal(good.view, 'front');
  assert.deepEqual(Object.keys(good.metrics).sort(), [...FRONT_METRICS].sort());
  assert.ok(good.metrics.elbowAlignment.value < 12, `alignment ${good.metrics.elbowAlignment.value}`);
  assert.equal(good.metrics.guideHand.status, 'good');
  assert.ok(good.metrics.sideDrift.value < 0.2);
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

test('follow-through is good from 40 degrees; release height measured where the ball leaves the hand', () => {
  const { s, r } = run({ followBeta: 45 });
  assert.equal(r.metrics.followThrough.status, 'good', `${r.metrics.followThrough.value}`);
  near(r.phases.release, s.releaseFrame, 8, 'ball release frame near the arm extension');
  const weak = run({ followBeta: 10 }).r;
  assert.notEqual(weak.metrics.followThrough.status, 'good');
});

test('a standing clip is flagged as a doubtful shot or rejected, never trusted', () => {
  const s = makeShot({ kneeFlex: 5, releaseT: 99, dipStart: 99, dipEnd: 99.1, riseEnd: 99.2, landT: 99.3 });
  const r = analyzeShooting(s.frames, { aspect: ASPECT, fps: 60, config });
  assert.ok(!r.ok || r.weakShot);
});

test('stance is measured from the front only, and too close is punished harder than too wide', () => {
  const front = analyzeShooting(makeFrontShot({}).frames, { aspect: ASPECT, fps: 60, config });
  near(front.metrics.stance.value, 0.57, 0.08, 'feet 0.08 apart, shoulders 0.14 apart');
  assert.notEqual(front.metrics.stance.status, 'good'); // too narrow for the 0.9-1.5 zone
  assert.ok(!('stance' in run({}).r.metrics) && !('footStagger' in run({}).r.metrics), 'no sideways stance from the side');
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

test('release is the arm straightening; follow-through comes after it', () => {
  const { s, r } = run({});
  near(r.phases.release, s.releaseFrame, 4, 'release near full extension');
  assert.ok(r.phases.follow >= r.phases.release, 'follow-through is never before the release');
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
});

test('scoreValue: good / borderline / needs-work', () => {
  const rg = { good: [45, 55], tolerance: 10 };
  assert.equal(scoreValue(50, rg).status, 'good');
  assert.equal(scoreValue(40, rg).status, 'borderline');
  assert.equal(scoreValue(20, rg).status, 'needs-work');
  assert.equal(scoreValue(50, rg).score, 100);
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

let passed = 0;
for (const [name, fn] of queue) { await fn(); passed++; console.log('ok -', name); }
console.log(`\n${passed} tests passed`);
