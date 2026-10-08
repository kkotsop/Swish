// Orchestrates one analysis run: pre-check -> pose -> isolate shot -> metrics -> key frames -> advice.
import { checkFps, checkOrientation, checkTracking, selectSubject, MESSAGES } from './precheck.js';
import { grabFrame, processClip } from './pose.js';
import { personalisedAdvice, summarize } from './coaching.js';

/** clip: { video, start, duration, fps, source:'record'|'upload' } -> { ok, result } | { ok:false, message } */
export async function runAnalysis({ clip, move, config, onStatus, onProgress, onPreview }) {
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

  onStatus('Finding you in the frame…');
  const fps = Math.min(config.analysisFps, Math.round(clip.fps || config.analysisFps));
  const earlyCheck = ({ per, brightness }) => {
    if (brightness < config.quality.minBrightness) return MESSAGES.dark;
    if (per.every((p) => !p.length)) return MESSAGES.noPerson;
    return null;
  };
  // Keep small stills of every 2nd frame so the report can replay the tracked shot like a short GIF.
  const small = document.createElement('canvas');
  const replayFrames = [];
  const onSample = (canvas, i) => {
    small.width = Math.min(420, canvas.width); small.height = Math.round((small.width * canvas.height) / canvas.width);
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    replayFrames.push({ i, src: small.toDataURL('image/jpeg', 0.72) });
  };
  let pass;
  try {
    pass = await processClip(video, { start: clip.start, duration: clip.duration, fps }, config, (p, info) => { onStatus('Tracking your body…'); onProgress(p, info); }, { earlyCheck, onPreview, onSample });
  } catch (e) {
    if (e.early) return fail(e.message);
    throw e;
  }
  const subject = selectSubject(pass.per, pass.times, config);
  const problem = checkTracking({ subject, total: pass.per.length, brightness: pass.brightness }, config);
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
  const replay = { fps: fps / 2, aspect: pass.aspect, frames: replayFrames.map((f) => ({ src: f.src, lm: subject.frames[f.i]?.lm || null })) };
  return { ok: true, result: { move: move.id, ts: Date.now(), hand: analysis.hand, handAmbiguous: analysis.handAmbiguous, score, metrics: analysis.metrics, metricIds: analysis.metricIds, view: analysis.view, summary: summarize(move.id, analysis.metrics, score), replay, stills, advice, ranges, warnings } };
}
