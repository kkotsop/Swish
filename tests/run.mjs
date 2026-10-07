import fs from 'node:fs';
import assert from 'node:assert/strict';
import { analyzeShooting, headlineScore, scoreValue } from '../js/shooting.js';
import { makeShot, ASPECT } from './synth.js';
import { selectSubject, checkTracking, checkOrientation, checkFps, poseBox } from '../js/precheck.js';
import { rangeFromValues, rangesFromClips } from '../js/calibrate.js';
import { templateAdvice, personalisedAdvice } from '../js/coaching.js';

const config = JSON.parse(fs.readFileSync(new URL('../config/settings.json', import.meta.url)));
const run = (o) => { const s = makeShot(o); return { s, r: analyzeShooting(s.frames, { aspect: ASPECT, fps: 60, config }) }; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}±${tol}`);
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
  near(r.metrics.tempo.value, 1.75 - 1.0, 0.12, 'tempo');
  near(r.metrics.forwardDrift.value, 0.1, 0.05, 'drift');
  assert.equal(Object.keys(r.metrics).length, 9);
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
    assert.ok(rr.metrics.releaseAngle.value > 0 && rr.metrics.releaseAngle.value < 180, `release angle ${rr.metrics.releaseAngle.value}`);
    assert.ok(rr.metrics.elbowAngle.value < 110, `elbow ${rr.metrics.elbowAngle.value}`);
  }
});

test('arms held straight up with no bend-to-extend is not a shot', () => {
  const sh = makeShot({});
  for (const f of sh.frames) { // freeze the right arm straight up for the whole clip
    const S = f.lm[12];
    f.lm[14] = { ...S, y: S.y - 0.1 }; f.lm[16] = { ...S, y: S.y - 0.2 }; f.lm[20] = { ...S, y: S.y - 0.24 };
  }
  const r = analyzeShooting(sh.frames, { aspect: ASPECT, fps: 60, config });
  assert.equal(r.ok, false); assert.equal(r.error, 'no-shot');
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

test('no shot in a standing clip is reported', () => {
  const s = makeShot({ kneeFlex: 5, releaseT: 99, dipStart: 99, dipEnd: 99.1, riseEnd: 99.2, landT: 99.3 });
  const r = analyzeShooting(s.frames, { aspect: ASPECT, fps: 60, config });
  assert.equal(r.ok, false);
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
  assert.equal(checkTracking({ subject: sub, total: 60, brightness: 120 }, config), null);
});

test('large central second person triggers the multiple-people warning', () => {
  const per = Array.from({ length: 60 }, () => [person(0.45, 0.6), person(0.6, 0.55)]);
  const sub = selectSubject(per, per.map((_, i) => i / 60), config);
  assert.equal(checkTracking({ subject: sub, total: 60, brightness: 120 }, config).code, 'multiple');
});

test('false detections (ball/hoop-like poses) are ignored; tiny subject gets a clear message', () => {
  const flat = Array.from({ length: 33 }, (_, i) => ({ x: 0.5 + (i % 3) * 0.01, y: 0.4 + (i % 2) * 0.01, z: 0, v: 0.9 })); // everything in one spot
  const sub0 = selectSubject(Array.from({ length: 60 }, () => [flat]), Array.from({ length: 60 }, (_, i) => i / 60), config);
  assert.equal(sub0.withPerson, 0);
  const tiny = Array.from({ length: 60 }, () => [person(0.5, 0.25)]);
  const sub1 = selectSubject(tiny, tiny.map((_, i) => i / 60), config);
  const c = checkTracking({ subject: sub1, total: 60, brightness: 120 }, config);
  assert.ok(c && (c.code === 'too-small' || c.code === 'no-person'), JSON.stringify(c));
  const big = Array.from({ length: 60 }, () => [person(0.5, 0.7)]);
  assert.equal(checkTracking({ subject: selectSubject(big, big.map((_, i) => i / 60), config), total: 60, brightness: 120 }, config), null);
});

test('dark, no-person, orientation, fps messages are specific', () => {
  const per = Array.from({ length: 60 }, () => [person(0.5, 0.6)]);
  const sub = selectSubject(per, per.map((_, i) => i / 60), config);
  assert.equal(checkTracking({ subject: sub, total: 60, brightness: 10 }, config).code, 'dark');
  const none = selectSubject(Array.from({ length: 60 }, () => []), per.map((_, i) => i), config);
  assert.equal(checkTracking({ subject: none, total: 60, brightness: 120 }, config).code, 'no-person');
  assert.match(checkOrientation(1920, 1080, 'portrait'), /rotate your phone to portrait/);
  assert.equal(checkOrientation(1080, 1920, 'portrait'), null);
  assert.equal(checkFps(30, config).level, 'warn');
  assert.match(checkFps(30, config).message, /30 fps.*low quality.*60 fps or higher/);
  assert.equal(checkFps(60, config), null);
  assert.equal(checkFps(59.94, config), null);
  assert.equal(checkFps(58.2, config), null);
  assert.equal(checkFps(45, config).level, 'warn');
  assert.equal(checkFps(20, config).level, 'block');
  assert.match(checkFps(20, config).message, /20 fps.*at least 24 fps/);
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

let passed = 0;
for (const [name, fn] of queue) { await fn(); passed++; console.log('ok -', name); }
console.log(`\n${passed} tests passed`);
