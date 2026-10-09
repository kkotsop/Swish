// Orchestrates one analysis run: pre-check -> pose -> isolate shot -> metrics -> key frames -> advice.
import { checkFps, assessTracking, selectSubject, MESSAGES } from './precheck.js';
import { grabFrame, processClip } from './pose.js';
import { personalisedAdvice } from './coaching.js';
import { blankMetric } from './shooting.js';

/** clip: { video, start, duration, fps, source:'record'|'upload' } -> { ok, result } | { ok:false, message } */
export async function runAnalysis({ clip, move, config, onStatus, onProgress, onPreview }) {
  const mcfg = config.moves[move.id];
  const { video } = clip;
  const fail = (message) => ({ ok: false, message });

  onStatus('Checking your clip…');
  const fpsCheck = clip.fps ? checkFps(clip.fps, config) : null;
  if (fpsCheck && fpsCheck.level === 'block') return fail(fpsCheck.message);
  const warnings = fpsCheck ? [fpsCheck.message] : [];
  // Portrait or landscape both work: the player is tracked wherever they are in the frame.
  if (clip.duration < 0.8) return fail(MESSAGES.tooShort);

  onStatus('Finding you in the frame…');
  const fps = Math.min(config.analysisFps, Math.round(clip.fps || config.analysisFps));
  const earlyCheck = ({ per, scouted }) => {
    if (scouted && per.every((p) => !p.length)) return MESSAGES.noPerson; // only after the zoomed search for a distant player came up empty
    return null;
  };
  // Small stills of every 2nd frame for the replay, and larger ones of every 3rd frame for the key-frame pictures,
  // collected while the clip plays so the report never has to seek the video again. Keyed by frame so a restart
  // (zoom crop) just overwrites the earlier ones.
  const small = document.createElement('canvas'), big = document.createElement('canvas');
  const replayByFrame = new Map(), stillByFrame = new Map();
  const onSample = (canvas, i) => {
    small.width = Math.min(420, canvas.width); small.height = Math.round((small.width * canvas.height) / canvas.width);
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    replayByFrame.set(i, small.toDataURL('image/jpeg', 0.72));
  };
  const onStill = (vid, i) => {
    const k = Math.min(1, 960 / vid.videoWidth);
    big.width = Math.round(vid.videoWidth * k); big.height = Math.round(vid.videoHeight * k);
    big.getContext('2d').drawImage(vid, 0, 0, big.width, big.height);
    stillByFrame.set(i, big.toDataURL('image/jpeg', 0.82));
  };
  let pass;
  try {
    pass = await processClip(video, { start: clip.start, duration: clip.duration, fps }, config, (p, info) => { onStatus('Tracking your body…'); onProgress(p, info); }, { earlyCheck, onPreview, onSample, onStill });
  } catch (e) {
    if (e.early) return fail(e.message);
    throw e;
  }
  const subject = selectSubject(pass.per, pass.times, config);
  const tracking = assessTracking({ subject, total: pass.per.length, brightness: pass.brightness }, config);
  if (tracking.fatal) return fail(tracking.fatal.message);
  warnings.push(...tracking.notes.map((x) => x.message));

  subject.frames.forEach((f, i) => { f.cam = pass.cam ? { x: pass.cam.x[i] || 0, y: pass.cam.y[i] || 0 } : null; }); // the phone may have panned: positions are taken in the world, not the picture
  onStatus('Analysing your shot…');
  const analysis = move.analyze(subject.frames, { aspect: pass.aspect, fps, config });
  if (!analysis.ok) return fail(analysis.error === 'too-short' ? MESSAGES.tooShort : MESSAGES.noShot);

  onStatus('Building your report…');
  const ranges = mcfg.ranges;
  const stills = {};
  const lastFrame = subject.frames.length - 1;
  for (const id of analysis.metricIds) if (!analysis.metrics[id]) analysis.metrics[id] = blankMetric(id, analysis.phases.release); // keep every card, blank where it could not be measured
  for (const m of Object.values(analysis.metrics)) m.frame = Math.max(0, Math.min(lastFrame, Number.isFinite(m.frame) ? m.frame : analysis.phases.release)); // an unmeasured metric still gets a picture
  const sampled = [...stillByFrame.keys()].sort((x, y) => x - y);
  const needed = new Set(Object.values(analysis.metrics).map((m) => m.frame));
  for (const idx of needed) {
    const near = sampled.length ? sampled.reduce((b, j) => (Math.abs(j - idx) < Math.abs(b - idx) ? j : b), sampled[0]) : -1;
    if (near >= 0 && Math.abs(near - idx) <= Math.max(3, Math.round(fps / 6))) { // a sampled frame within ~0.1 s: no seeking needed
      stills[idx] = { src: stillByFrame.get(near), lm: subject.frames[near]?.lm || null };
    } else {
      stills[idx] = { src: await grabFrame(video, clip.start + idx / fps), lm: subject.frames[idx]?.lm || null };
    }
  }
  if (analysis.weakShot) warnings.push(MESSAGES.weakShot);
  if (analysis.viewAngled) warnings.push(`Filmed at an angle, so we treated it as ${analysis.view}-on. For the cleanest numbers film exactly side-on or exactly facing the phone.`);
  const lower = { high: 'medium', medium: 'low', low: 'low' };
  const shaky = tracking.notes.length > 0; // dark, small or crowded clips: every number is less certain
  if (shaky) for (const m of Object.values(analysis.metrics)) m.confidence = lower[m.confidence] || 'low';
  if (fpsCheck) { // timing-sensitive metrics are less trustworthy at low frame rates
    for (const id of ['releaseAngle', 'tempo', 'legArmTiming']) {
      if (analysis.metrics[id] && analysis.metrics[id].confidence === 'high') analysis.metrics[id].confidence = 'medium';
    }
  }
  const score = move.headline(analysis.metrics, mcfg.weights, mcfg.confidenceWeights); // after the confidence adjustments above
  const advice = await personalisedAdvice(move.id, analysis.metrics, ranges, config);
  const replay = { fps: fps / 2, aspect: pass.aspect, frames: [...replayByFrame.keys()].sort((x, y) => x - y).map((i) => ({ src: replayByFrame.get(i), lm: subject.frames[i]?.lm || null })) };
  return { ok: true, result: { move: move.id, ts: Date.now(), hand: analysis.hand, handAmbiguous: analysis.handAmbiguous, handSource: analysis.handSource, score, metrics: analysis.metrics, metricIds: analysis.metricIds, view: analysis.view, replay, stills, advice, ranges, warnings } };
}
