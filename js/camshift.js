// Camera pan estimation. When the phone follows the player, the player barely moves in the picture even while really
// travelling, so anything measured from picture positions (forward drift, jump height) needs the camera's own movement
// taken out. The background is tracked on tiny grey copies of the frames, ignoring the player, and the shifts are added up.
// Pure functions (no DOM) so they are unit tested.

/** RGBA pixels -> one grey byte per pixel. */
export function grayOf(rgba) {
  const out = new Uint8Array(rgba.length >> 2);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return out;
}

/** Mark the pixels covered by a normalised box { x0, y0, x1, y1 } (grown by `pad`), so the player is left out of the matching. */
export function maskOf(box, w, h, pad = 0.3) {
  const m = new Uint8Array(w * h);
  if (!box) return m;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const x0 = Math.max(0, Math.floor((box.x0 - bw * pad) * w)), x1 = Math.min(w - 1, Math.ceil((box.x1 + bw * pad) * w));
  const y0 = Math.max(0, Math.floor((box.y0 - bh * pad) * h)), y1 = Math.min(h - 1, Math.ceil((box.y1 + bh * pad) * h));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
  return m;
}

/**
 * How far the picture content moved from frame a to frame b, in pixels (positive dx = content moved right, i.e. the camera
 * panned left). The frame is cut into blocks and every block finds its own best shift; the answer is the MEDIAN of those, so a
 * player (or ball, or a bystander) moving through part of the picture is simply outvoted by the background. The blocks that agree
 * with the median then share one cost surface for a sub-pixel fit.
 * Result: dx, dy; `q` how clear the best match is (0 = no better than average), `u` how unique it is (near 0 on repeating
 * patterns such as rows of seats), `sad` the average grey-level difference at the best match (large across a scene cut) and
 * `agree` the share of usable blocks that voted with the median (low = the picture is moving in more than one way).
 */
export function estimateShift(a, b, w, h, maskA, maskB, { rx = 0.22, ry = 0.1, bx = 4, by = 6 } = {}) {
  const RX = Math.max(2, Math.round(w * rx)), RY = Math.max(1, Math.round(h * ry)), NX = 2 * RX + 1, NY = 2 * RY + 1, NB = bx * by, NO = NX * NY;
  let skip = maskA || maskB || null; // pixels outside the player in either frame (the same set for every candidate shift)
  if (maskA && maskB) { skip = new Uint8Array(maskA.length); for (let i = 0; i < skip.length; i++) skip[i] = maskA[i] | maskB[i]; }
  const bw = w / bx, bh = h / by;
  const sum = new Float64Array(NB * NO), cnt = new Uint16Array(NB * NO);
  for (let dy = -RY; dy <= RY; dy++) for (let dx = -RX; dx <= RX; dx++) {
    const o = (dy + RY) * NX + dx + RX;
    for (let y = Math.max(0, -dy); y < h - Math.max(0, dy); y += 2) {
      const ya = y * w, yb = (y + dy) * w, row = Math.min(by - 1, Math.floor(y / bh)) * bx;
      for (let x = Math.max(0, -dx); x < w - Math.max(0, dx); x += 2) {
        if (skip && skip[ya + x]) continue;
        const d = a[ya + x] - b[yb + x + dx], k = (row + Math.min(bx - 1, Math.floor(x / bw))) * NO + o;
        sum[k] += d < 0 ? -d : d; cnt[k]++;
      }
    }
  }
  const costOf = (blk, o) => { const k = blk * NO + o; return cnt[k] >= 10 ? sum[k] / cnt[k] : Infinity; };
  const votes = [];
  for (let blk = 0; blk < NB; blk++) {
    let best = Infinity, bo = -1, total = 0, n = 0;
    for (let o = 0; o < NO; o++) { const c = costOf(blk, o); if (c === Infinity) continue; total += c; n++; if (c < best) { best = c; bo = o; } }
    if (bo < 0 || n < NO * 0.5) continue; // mostly player: not a vote
    const mean = total / n;
    if (mean <= 0 || (mean - best) / mean < 0.08) continue; // a flat or featureless block cannot vote
    votes.push({ blk, dx: (bo % NX) - RX, dy: Math.floor(bo / NX) - RY });
  }
  if (votes.length < 4) return { dx: 0, dy: 0, q: 0, u: 0, sad: Infinity, agree: 0 };
  const med = (arr) => { const t = [...arr].sort((p, q) => p - q), m = t.length >> 1; return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; };
  const mdx = Math.round(med(votes.map((v) => v.dx))), mdy = Math.round(med(votes.map((v) => v.dy)));
  const crowd = votes.filter((v) => Math.abs(v.dx - mdx) <= 1 && Math.abs(v.dy - mdy) <= 1);
  const agree = crowd.length / votes.length;
  // one shared cost surface from the blocks that agree
  const grid = new Float64Array(NO).fill(Infinity);
  let best = Infinity, bo = 0, total = 0, count = 0;
  for (let o = 0; o < NO; o++) {
    let c = 0, m = 0;
    for (const v of crowd) { const x = costOf(v.blk, o); if (x !== Infinity) { c += x; m++; } }
    if (!m) continue;
    grid[o] = c / m; total += grid[o]; count++;
    if (grid[o] < best) { best = grid[o]; bo = o; }
  }
  const bxs = (bo % NX) - RX, bys = Math.floor(bo / NX) - RY;
  const mean = total / count, q = mean > 0 ? (mean - best) / mean : 0;
  let second = Infinity;
  for (let o = 0; o < NO; o++) { const ox = (o % NX) - RX, oy = Math.floor(o / NX) - RY; if (Math.abs(ox - bxs) <= 3 && Math.abs(oy - bys) <= 3) continue; if (grid[o] < second) second = grid[o]; }
  const u = second === Infinity ? 1 : (second - best) / (second || 1);
  const at = (dx, dy) => (dx < -RX || dx > RX || dy < -RY || dy > RY ? Infinity : grid[(dy + RY) * NX + dx + RX]);
  const sub = (cm, c0, cp) => { const d = cm - 2 * c0 + cp; return d > 1e-9 && Number.isFinite(cm) && Number.isFinite(cp) ? Math.max(-0.5, Math.min(0.5, (cm - cp) / (2 * d))) : 0; };
  return { dx: bxs + sub(at(bxs - 1, bys), best, at(bxs + 1, bys)), dy: bys + sub(at(bxs, bys - 1), best, at(bxs, bys + 1)), q, u, sad: best, agree };
}

/**
 * The camera's path over a clip: for every frame, how far the background content has moved since the first frame as a
 * fraction of the frame width / height (x[i], y[i]). A point fixed in the world appears at (its first position + x[i]),
 * so subtracting x[i] from a picture position gives the position in the world. grays[i] may be null (frame not analysed:
 * the camera is assumed still across that gap); boxes[i] is the player's normalised box in that frame, or null.
 *
 * Matching consecutive frames would under-read a slow pan badly: each step is a fraction of a pixel and the sub-pixel fit
 * shrinks tiny shifts toward zero (measured: about half of the true total). So each frame is matched against a key frame
 * far enough back for the shift to be at least `minStep` pixels (or `maxGap` frames back), and the frames in between are
 * interpolated. A camera that hardly moved, or a background with no texture to follow, gives zeros.
 */
export function camPath(grays, boxes, w, h, { minQuality = 0.1, minUnique = 0.07, maxSad = 18, minAgree = 0.5, still = 0.012, minStep = 2, maxGap = 16 } = {}) {
  const n = grays.length, x = new Array(n).fill(0), y = new Array(n).fill(0);
  // A frame where the pose model lost the player still has the player in it: use the nearest known box so they are masked out
  // (left in, a person walking off would be mistaken for the background moving).
  const known = boxes ? boxes.map((b, i) => (b ? i : -1)).filter((i) => i >= 0) : [];
  const boxFor = (i) => { if (!known.length) return null; let best = known[0]; for (const k of known) if (Math.abs(k - i) < Math.abs(best - i)) best = k; return boxes[best]; };
  const masks = new Map();
  const maskAt = (i) => { if (!masks.has(i)) masks.set(i, maskOf(boxFor(i), w, h, 0.4)); return masks.get(i); };
  let key = -1, kx = 0, ky = 0, last = -1;
  for (let i = 0; i < n; i++) {
    if (!grays[i]) continue;
    last = i;
    if (key < 0) { key = i; continue; }
    const s = estimateShift(grays[key], grays[i], w, h, maskAt(key), maskAt(i));
    const trusted = s.q >= minQuality && s.u >= minUnique && s.sad <= maxSad && s.agree >= minAgree; // clear, unambiguous and from the same scene (not a cut)
    const far = trusted && (Math.abs(s.dx) >= minStep || Math.abs(s.dy) >= minStep);
    if (!far && i - key < maxGap) continue; // not enough movement yet to measure well: keep the same key frame
    const nx = kx + (trusted ? s.dx / w : 0), ny = ky + (trusted ? s.dy / h : 0);
    for (let j = key + 1; j <= i; j++) { const t = (j - key) / (i - key); x[j] = kx + (nx - kx) * t; y[j] = ky + (ny - ky) * t; }
    key = i; kx = nx; ky = ny;
  }
  if (last > key) { // the stretch since the last key frame, however little it moved
    const s = estimateShift(grays[key], grays[last], w, h, maskAt(key), maskAt(last));
    const ok = s.q >= minQuality && s.u >= minUnique && s.sad <= maxSad && s.agree >= minAgree;
    const nx = kx + (ok ? s.dx / w : 0), ny = ky + (ok ? s.dy / h : 0);
    for (let j = key + 1; j <= last; j++) { const t = (j - key) / (last - key); x[j] = kx + (nx - kx) * t; y[j] = ky + (ny - ky) * t; }
    kx = nx; ky = ny;
  }
  for (let j = Math.max(last, 0) + 1; j < n; j++) { x[j] = kx; y[j] = ky; } // frames after the last analysed one
  const moved = Math.max(...x.map(Math.abs), ...y.map(Math.abs)) >= still;
  if (!moved) return { x: new Array(n).fill(0), y: new Array(n).fill(0), moved: false };
  return { x, y, moved: true };
}
