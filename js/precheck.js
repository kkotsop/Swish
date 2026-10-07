// Quality pre-check and main-subject selection. Pure functions (no DOM) so they can be unit tested.
import { clamp, mean, median } from './mathutil.js';

export function poseBox(lm) {
  const pts = lm.filter((p) => p && (p.v ?? 1) > 0.3);
  if (pts.length < 8) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, x1, y0, y1, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/**
 * Is this pose a believable standing/jumping person? Rejects false detections on balls, hoops, shadows etc.
 * Needs good visibility on the core joints, a sensible head-to-feet order and a body that is not tiny.
 */
export function isPlausibleHuman(lm) {
  const core = [11, 12, 23, 24, 25, 26, 27, 28].map((i) => lm[i]);
  if (core.some((p) => !p)) return false;
  if (mean(core.map((p) => p.v ?? 1)) < 0.5) return false;
  const avgY = (a, b) => (lm[a].y + lm[b].y) / 2;
  const sh = avgY(11, 12), hip = avgY(23, 24), knee = avgY(25, 26), ank = avgY(27, 28);
  if (!(sh < hip && hip < knee && knee < ank + 0.02)) return false; // upright order (feet lowest)
  return hip - sh > 0.04 && ank - sh > 0.12;
}

/**
 * Pick the main subject in each frame: largest, most central, most consistently tracked figure.
 * perFrame: array (one per frame) of arrays of landmark lists. Returns { frames, secondShare }.
 */
export function selectSubject(perFrame, times, cfg) {
  const q = cfg.quality;
  let prev = null, secondCount = 0, withPerson = 0;
  const heights = [];
  const frames = perFrame.map((poses, i) => {
    const cands = (poses || []).filter(isPlausibleHuman).map((lm) => ({ lm, box: poseBox(lm) })).filter((c) => c.box);
    if (!cands.length) return { t: times[i], lm: null };
    withPerson++;
    const score = (c) => {
      let s = c.box.h * (1 - clamp(Math.abs(c.box.cx - 0.5) * 1.6, 0, 0.8));
      if (prev) s *= 1 + 1.5 * (1 - clamp(Math.hypot(c.box.cx - prev.cx, c.box.cy - prev.cy) * 4, 0, 1));
      return s;
    };
    cands.sort((a, b) => score(b) - score(a));
    const main = cands[0];
    heights.push(main.box.h);
    prev = main.box;
    const [bandLo, bandHi] = q.secondPersonCentralBand;
    if (cands[1] && cands[1].box.h >= q.secondPersonSizeRatio * main.box.h && cands[1].box.cx > bandLo && cands[1].box.cx < bandHi) secondCount++;
    return { t: times[i], lm: main.lm };
  });
  return { frames, withPerson, secondShare: frames.length ? secondCount / frames.length : 0, medianHeight: heights.length ? median(heights) : 0 };
}

export const MESSAGES = {
  fpsWarn: (fps, rec) => `This clip is ${Math.round(fps)} fps, which is low quality. It will still work, but ${rec} fps or higher gives much more accurate results.`,
  fpsBlock: (fps, min) => `This clip is ${Math.round(fps)} fps; we need at least ${min} fps to track a shot.`,
  orientation: (want) => `Please rotate your phone to ${want} for this move.`,
  dark: 'This clip is too dark to analyse. Try recording with more light.',
  noPerson: "We couldn't get a clear view of you. Make sure you're fully in frame and well lit.",
  multiple: "We detected more than one person. Make sure you're alone in the shot.",
  tooSmall: "You're too small in the frame. Move the phone closer (or zoom in) so you fill most of the frame, head to feet.",
  noShot: "We couldn't find a shot in this clip. Record the whole motion: load, jump and release.",
  tooShort: 'This clip is too short to analyse. Record about 5 seconds.',
};

export function checkOrientation(width, height, want) {
  const isPortrait = height >= width;
  return (want === 'portrait') === isPortrait ? null : MESSAGES.orientation(want);
}
// 5% tolerance: iPhones record "60 fps" as 59.94 and playback-based fps measurement is slightly noisy.
// Returns null (fine), { level: 'warn', message } (works, but lower quality) or { level: 'block', message }.
export function checkFps(fps, cfg) {
  if (!fps || fps >= cfg.minFps * 0.95) return null;
  if (fps < cfg.hardMinFps * 0.95) return { level: 'block', message: MESSAGES.fpsBlock(fps, cfg.hardMinFps) };
  return { level: 'warn', message: MESSAGES.fpsWarn(fps, cfg.minFps) };
}

/** Returns null if fine, else { code, message }. */
export function checkTracking({ subject, total, brightness }, cfg) {
  const q = cfg.quality;
  if (brightness != null && brightness < q.minBrightness) return { code: 'dark', message: MESSAGES.dark };
  if (!total || subject.withPerson / total < q.minPersonFrames) return { code: 'no-person', message: MESSAGES.noPerson };
  const vis = mean(subject.frames.filter((f) => f.lm).map((f) => mean(f.lm.map((p) => p.v ?? 1))));
  if (vis < 0.35) return { code: 'no-person', message: MESSAGES.noPerson };
  if (subject.medianHeight < q.minSubjectHeight) return { code: 'too-small', message: MESSAGES.tooSmall };
  if (subject.secondShare >= q.secondPersonFrameShare) return { code: 'multiple', message: MESSAGES.multiple };
  return null;
}
