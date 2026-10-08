// Spring motion helpers (Apple's response/damping model). No dependencies.
// A spring always animates from the live value and carries velocity, so it can be grabbed and redirected at any moment.

/** Damped spring from `from` to `to`. response = seconds to reach the target (not a duration); damping 1 = no overshoot. */
export function spring({ from, to, velocity = 0, response = 0.3, damping = 1, restDelta = 0.3, restSpeed = 5, onUpdate, onDone }) {
  const w = (2 * Math.PI) / response, k = w * w, c = 2 * damping * w;
  let x = from, v = velocity, last = performance.now(), raf = 0, done = false;
  const step = (t) => {
    const dt = Math.max(0, Math.min(0.032, (t - last) / 1000)); last = Math.max(last, t); // rAF time can predate the start
    const n = Math.max(1, Math.ceil(dt / 0.004)), hh = dt / n; // small fixed sub-steps keep stiff springs stable
    for (let i = 0; i < n; i++) { v += (-k * (x - to) - c * v) * hh; x += v * hh; }
    if (Math.abs(x - to) < restDelta && Math.abs(v) < restSpeed) { x = to; v = 0; done = true; onUpdate(x, v); if (onDone) onDone(); return; }
    onUpdate(x, v);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { cancel() { if (!done) cancelAnimationFrame(raf); done = true; } };
}

/** Where a flick at `velocity` (px/s) would come to rest, using scroll-style exponential deceleration. */
export const project = (velocity, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

/** Progressive resistance past an edge: the further you pull, the less it follows. */
export const rubberband = (overshoot, dimension, constant = 0.55) => (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

/**
 * Press physics for every tappable control: it sinks under the finger the instant it lands (spring, no overshoot) and
 * springs back with a little bounce on release. Uses the individual `scale` property so it never fights `transform`.
 */
export function initPress(selector = '.btn, .move, .chip, .back, .level-pill, .avatar-btn, .avatar.big, .seg button, .drop-ico') {
  const states = new WeakMap();
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = null;
  const scaleTo = (el, to, response, damping) => {
    let st = states.get(el);
    if (!st) { st = { v: 1, vel: 0, anim: null }; states.set(el, st); }
    if (st.anim) st.anim.cancel(); // grabbing mid-bounce continues from where it is, with its velocity
    if (reduced()) { st.v = to; st.vel = 0; if (to === 1) el.style.removeProperty('scale'); else el.style.scale = String(to); return; }
    st.anim = spring({ from: st.v, to, velocity: st.vel, response, damping, restDelta: 0.0006, restSpeed: 0.006, // scale units, not pixels
      onUpdate: (x, v) => { st.v = x; st.vel = v; el.style.scale = x.toFixed(4); },
      onDone: () => { if (to === 1) el.style.removeProperty('scale'); } });
  };
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest(selector);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    active = el;
    scaleTo(el, el.matches('.move') ? 0.955 : 0.95, 0.16, 1);
  }, { passive: true });
  const release = () => { if (!active) return; const el = active; active = null; scaleTo(el, 1, 0.42, 0.55); };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true }); // a swipe on the carousel cancels the press
}
