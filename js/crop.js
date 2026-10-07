// Player-centred crop maths for report images. Pure functions (no DOM) so they can be unit tested.

/** Normalised box around the tracked player across the given landmark sets, with generous room for background and the whole body. */
export function playerBox(lms) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const lm of lms) for (const [i, p] of (lm || []).entries()) {
    if (!p || (p.v ?? 1) < (i >= 23 ? 0.15 : 0.3)) continue; // keep hips, knees and feet even when tracking is weaker there
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w: 1, h: 1 };
  const w = x1 - x0, h = y1 - y0;
  x0 = Math.max(0, x0 - w * 0.45); x1 = Math.min(1, x1 + w * 0.45); // room on the sides for the shot and the surroundings
  y0 = Math.max(0, y0 - h * 0.18); y1 = Math.min(1, y1 + h * 0.12); // headroom above, floor below the feet
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Widen the box to at least 4:5 (never a narrow strip), staying inside the frame. */
export function fitAspect(box, sw, sh, minAspect = 0.8) {
  let w = box.w * sw, hgt = box.h * sh, x = box.x * sw, y = box.y * sh;
  if (w / hgt < minAspect) {
    const nw = Math.min(sw, hgt * minAspect), cx = x + w / 2;
    x = Math.max(0, Math.min(sw - nw, cx - nw / 2)); w = nw;
    if (w / hgt < minAspect) { const nh = w / minAspect, cy = y + hgt / 2; y = Math.max(0, Math.min(sh - nh, cy - nh / 2)); hgt = nh; } // frame too narrow: trim height instead
  }
  return { x, y, w, h: hgt };
}
