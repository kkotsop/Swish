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
