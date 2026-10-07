// Orchestrates one analysis run: pre-check -> pose -> isolate shot -> metrics -> key frames -> advice.
import { checkFps, checkOrientation, checkTracking, selectSubject, MESSAGES } from './precheck.js';
import { grabFrame, probeClip, processClip } from './pose.js';
import { personalisedAdvice } from './coaching.js';

/** clip: { video, start, duration, fps, source:'record'|'upload' } -> { ok, result } | { ok:false, message } */
export async function runAnalysis({ clip, move, config, onStatus, onProgress }) {
  const mcfg = config.moves[move.id];
  const { video } = clip;
  const fail = (message) => ({ ok: false, message });

  onStatus('Checking your clip…');
  const fpsCheck = clip.fps ? checkFps(clip.fps, config) : null;
  if (fpsCheck && fpsCheck.level === 'block') return fail(fpsCheck.message);
  const warnings = fpsCheck ? [fpsCheck.message] : [];
  const oriMsg = checkOrientation(video.videoWidth, video.videoHeight, move.orientation);
  if (oriMsg) return fail(oriMsg);
  if (clip.duration < 1.5) return fail(MESSAGES.tooShort);

  // Quick probe on a few frames first: fail fast on dark / no-person / crowded clips.
  onStatus('Looking for you in the frame…');
  const probe = await probeClip(video, clip, config);
  const probeSubject = selectSubject(probe.per, probe.times, config);
  const probeProblem = checkTracking({ subject: probeSubject, total: probe.per.length, brightness: probe.brightness }, config);
  if (probeProblem) return fail(probeProblem.message);

  onStatus('Tracking your body…');
  const fps = Math.min(config.analysisFps, Math.round(clip.fps || config.analysisFps));
  const pass = await processClip(video, { start: clip.start, duration: clip.duration, fps }, config, onProgress);
  const subject = selectSubject(pass.per, pass.times, config);
  const problem = checkTracking({ subject, total: pass.per.length, brightness: probe.brightness }, config);
  if (problem) return fail(problem.message);

  onStatus('Analysing your shot…');
  const analysis = move.analyze(subject.frames, { aspect: pass.aspect, fps, config });
  if (!analysis.ok) return fail(analysis.error === 'too-short' ? MESSAGES.tooShort : MESSAGES.noShot);

  onStatus('Building your report…');
  const ranges = mcfg.ranges;
  const score = move.headline(analysis.metrics, mcfg.weights);
  const stills = {};
  const needed = new Set(Object.values(analysis.metrics).map((m) => m.frame));
  for (const idx of needed) {
    stills[idx] = { src: await grabFrame(video, clip.start + idx / fps), lm: subject.frames[idx]?.lm || null };
  }
  if (fpsCheck) { // timing-sensitive metrics are less trustworthy at low frame rates
    for (const id of ['releaseAngle', 'followThrough', 'tempo']) {
      if (analysis.metrics[id].confidence === 'high') analysis.metrics[id].confidence = 'medium';
    }
  }
  const advice = await personalisedAdvice(move.id, analysis.metrics, ranges, config);
  return { ok: true, result: { move: move.id, ts: Date.now(), hand: analysis.hand, handAmbiguous: analysis.handAmbiguous, score, metrics: analysis.metrics, stills, advice, ranges, warnings } };
}
