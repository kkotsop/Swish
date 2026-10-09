// The "follow camera" for the live view while a clip is analysed: it eases a zoomed window onto the tracked player so
// they sit in the middle of the box instead of wherever they happen to stand in the shot. The maths is pure (no DOM) so
// it is unit tested; only drawFollow touches a canvas.

const FLOOR = 0.42; // never zoom in further than this fraction of the frame (2.4x)
const OVERSCAN = 0.18; // how far the window may slide past the frame edge to keep a player near the side centred

/** Where the camera should look: the middle of the tracked body and how much of the frame to show. Landmarks are normalised. */
export function camTarget(lm) {
  if (!lm) return null;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, seen = 0;
  for (const [i, p] of lm.entries()) {
    if (!p || (p.v ?? 1) < (i >= 23 ? 0.12 : 0.3)) continue; // hips, knees and feet count even when tracking is weaker there
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); seen++;
  }
  if (seen < 6 || x1 <= x0 || y1 <= y0) return null;
  // The window keeps the frame's shape, so it covers the same fraction `s` of the width and the height.
  const s = Math.max(FLOOR, Math.min(1, Math.max((y1 - y0) * 1.6, (x1 - x0) * 1.8))); // headroom, floor and room for raised arms
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - 0.04 * s, s }; // look a touch higher: the ball rises above the hands
}

/** Ease the camera toward its target. dt is in seconds; the pan is quicker than the zoom so the picture never pumps. */
export function stepCam(cam, target, dt, { pan = 0.3, zoom = 0.55 } = {}) {
  if (!target) return cam;
  const kp = 1 - Math.exp(-dt / pan), kz = 1 - Math.exp(-dt / zoom);
  cam.cx += (target.cx - cam.cx) * kp; cam.cy += (target.cy - cam.cy) * kp; cam.s += (target.s - cam.s) * kz;
  return cam;
}

/** The window to draw, in source pixels. It may slide a little past the frame (OVERSCAN) so the player can stay centred. */
export function cropRect(cam, sw, sh) {
  const w = cam.s * sw, h = cam.s * sh;
  const x = Math.max(-OVERSCAN * w, Math.min(sw - w + OVERSCAN * w, cam.cx * sw - w / 2));
  const y = Math.max(-OVERSCAN * h, Math.min(sh - h + OVERSCAN * h, cam.cy * sh - h / 2));
  return { x, y, w, h };
}

let ambient = null;
/**
 * Paint the window onto ctx's canvas, then the skeleton on top in the same zoomed space. Anything the window shows beyond
 * the frame is filled with a soft blur of the picture itself, so it never looks like a hole. `drawSkel(ctx, lm, { w, h })`
 * draws normalised landmarks at w x h.
 */
export function drawFollow(ctx, src, cam, lm, drawSkel) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const r = cropRect(cam, src.width, src.height), k = W / r.w;
  const outside = r.x < 0 || r.y < 0 || r.x + r.w > src.width || r.y + r.h > src.height;
  if (outside) {
    ambient = ambient || document.createElement('canvas');
    ambient.width = 24; ambient.height = Math.max(2, Math.round((24 * src.height) / src.width));
    ambient.getContext('2d').drawImage(src, 0, 0, ambient.width, ambient.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ambient, 0, 0, W, H);
    ctx.fillStyle = 'rgba(8, 12, 20, .5)'; ctx.fillRect(0, 0, W, H);
  }
  const sx = Math.max(0, r.x), sy = Math.max(0, r.y), ex = Math.min(src.width, r.x + r.w), ey = Math.min(src.height, r.y + r.h);
  ctx.drawImage(src, sx, sy, ex - sx, ey - sy, (sx - r.x) * k, (sy - r.y) * k, (ex - sx) * k, (ey - sy) * k);
  if (outside) { // feather the seam where the picture ends, so it fades into the soft backdrop instead of a hard edge
    const f = Math.min(W, H) * 0.12, fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(8, 12, 20, .55)'); g.addColorStop(1, 'rgba(8, 12, 20, 0)');
      ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    };
    const L = (sx - r.x) * k, T = (sy - r.y) * k, Rr = L + (ex - sx) * k, B = T + (ey - sy) * k;
    if (L > 1) fade(L, 0, L + f, 0, L, 0, f, H);
    if (Rr < W - 1) fade(Rr, 0, Rr - f, 0, Rr - f, 0, f, H);
    if (T > 1) fade(0, T, 0, T + f, 0, T, W, f);
    if (B < H - 1) fade(0, B, 0, B - f, 0, B - f, W, f);
  }
  if (lm && drawSkel) {
    ctx.save();
    ctx.translate(-r.x * k, -r.y * k); ctx.scale(k, k);
    drawSkel(ctx, lm, { w: src.width, h: src.height, hand: null });
    ctx.restore();
  }
}
