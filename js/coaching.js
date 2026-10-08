// Coaching copy per metric (what / why / how to improve) + personalised advice text.
// Template sentences always work offline; an optional LLM proxy can replace the "improve" text.
export const SHOOTING_COPY = {
  releaseAngle: {
    name: 'Release angle', short: 'Release',
    what: 'The direction the ball travels as it leaves your hand, measured from your wrist movement.',
    why: 'A flat release sends the ball on a low line to the rim, so you need a perfect aim to score. A high arc has a bigger target.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your release angle is ${fmt(v, 0)}°, right in the ${r.good[0]}–${r.good[1]}° zone. Keep driving up through the ball.`
      : v < r.good[0]
        ? `Your release angle is ${fmt(v, 0)}°; aim for ${r.good[0]}–${r.good[1]}°. Drive up through your legs and release at the top of the jump instead of pushing the ball forward with your arm.`
        : `Your release angle is ${fmt(v, 0)}°, steeper than the ${r.good[0]}–${r.good[1]}° zone. Let the ball travel more forward toward the rim and extend your arm through the target.`,
  },
  forwardDrift: {
    name: 'Forward drift', short: 'Balance',
    what: 'How far your body travels forward (or back) between takeoff and landing, measured in shin lengths.',
    why: 'Drifting while the ball is still in your hand throws off your balance and your aim. Good shooters land close to where they took off.',
    improve: (v, r, res) => res.status === 'good'
      ? `You travelled ${fmt(v, 2)} shin lengths ${res.note}. Great balance, you land where you launched.`
      : `You drifted ${fmt(v, 2)} shin lengths ${res.note}; aim for under ${r.good[1]}. Jump straight up, keep your core tight and land on the same spot you took off from.`,
  },
  elbowAngle: {
    name: 'Elbow angle at set', short: 'Set elbow',
    what: 'The bend in your shooting elbow at the moment you hold the ball ready to shoot.',
    why: 'A set point that is too tight or too open changes how much the arm has to push, and makes the shot inconsistent.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your elbow is at ${fmt(v, 0)}° at the set point, a repeatable L-shape.`
      : v < r.good[0]
        ? `Your elbow is bent to ${fmt(v, 0)}° at the set point; aim for ${r.good[0]}–${r.good[1]}°. Open the elbow a little so the ball sits in front of your shooting shoulder.`
        : `Your elbow is at ${fmt(v, 0)}° at the set point; aim for ${r.good[0]}–${r.good[1]}°. Tuck it in to make a clear L-shape before you extend.`,
  },
  kneeDip: {
    name: 'Knee dip depth', short: 'Knee dip',
    what: 'How much your knees bend when you load before the jump.',
    why: 'Your legs are the engine. A shallow dip means the arm does the work, and that costs range and consistency.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your knees bend ${fmt(v, 0)}° on the load, a strong base for power.`
      : v < r.good[0]
        ? `Your knees bend only ${fmt(v, 0)}°; aim for ${r.good[0]}–${r.good[1]}°. Sit into the shot so your legs power the ball up to the rim.`
        : `Your knees bend ${fmt(v, 0)}°, deeper than the ${r.good[0]}–${r.good[1]}° zone. A shallower dip makes the shot quicker and easier to repeat.`,
  },
  elbowAlignment: {
    name: 'Elbow alignment', short: 'Elbow line',
    what: 'How well your elbow stays under the ball as it rises, seen from the front: the forearm tilt away from straight up.',
    why: 'When the elbow flares out, the ball is pushed sideways instead of straight at the rim.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your forearm is only ${fmt(v, 0)}° off vertical. Elbow stays under the ball.`
      : `Your forearm tilts ${fmt(v, 0)}° off vertical; aim for under ${r.good[1]}°. Keep your elbow under the ball and point it at the rim.`,
  },
  releaseHeight: {
    name: 'Release height', short: 'Height',
    what: 'How high above the floor the ball leaves your fingertips, compared with your standing height.',
    why: 'A higher release is harder to block and gives the ball a steeper path down into the rim.',
    improve: (v, r, res) => res.status === 'good'
      ? `You release at ${fmt(v, 2)}x your height, comfortably above your head.`
      : `You release at ${fmt(v, 2)}x your height; aim for ${r.good[0]}–${r.good[1]}x. Extend fully and let go at the top, above your forehead.`,
  },
  followThrough: {
    name: 'Follow-through', short: 'Follow',
    what: 'How far your fingers point toward the floor after the ball leaves your hand.',
    why: 'A snapped wrist puts backspin on the ball for a soft touch off the rim. A stiff wrist gives a flat, bouncy shot.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your fingers snap down to ${fmt(v, 0)}°. Nice finish.`
      : `Your fingers only reach ${fmt(v, 0)}° below horizontal; aim for ${r.good[0]}°+. Snap your wrist like reaching into the cookie jar and hold the finish.`,
  },
  tempo: {
    name: 'Shot tempo', short: 'Tempo',
    what: 'The time from starting your load to releasing the ball.',
    why: 'Too slow gives defenders time to close out. Too rushed breaks your rhythm. A smooth, repeatable tempo builds consistency.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your shot takes ${fmt(v, 2)} s from load to release, smooth and repeatable.`
      : v > r.good[1]
        ? `Your shot takes ${fmt(v, 2)} s; aim for ${r.good[0]}–${r.good[1]} s. Dip and rise in one fluid motion without pausing at the set point.`
        : `Your shot takes ${fmt(v, 2)} s, quicker than the ${r.good[0]}–${r.good[1]} s zone. Slow the load slightly so legs and arm work together.`,
  },
  sideDrift: {
    name: 'Sideways drift', short: 'Balance',
    what: 'How far your body slides left or right between takeoff and landing, measured in shoulder widths (seen from the front).',
    why: 'Sliding sideways in the air pulls the ball off line, so it misses left or right. Good shooters land in the same spot they jumped from.',
    improve: (v, r, res) => res.status === 'good'
      ? `You moved ${fmt(v, 2)} shoulder widths sideways. Great balance, you land where you launched.`
      : `You drifted ${fmt(v, 2)} shoulder widths sideways; aim for under ${r.good[1]}. Square your feet to the rim, jump straight up and land in the same spot.`,
  },
  guideHand: {
    name: 'Guide hand', short: 'Off hand',
    what: 'How close your off hand stays to the ball while it is held and rising, measured in forearm lengths from your shooting hand.',
    why: 'The off hand should only steady the ball from the side. If it drifts away or hangs low it cannot guide the ball, and if it pushes it adds sidespin and misses left or right.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your off hand stays ${fmt(v, 1)} forearms from your shooting hand, close enough to steady the ball from the side.`
      : `Your off hand is ${fmt(v, 1)} forearms away from your shooting hand; aim for under ${r.good[1]}. Keep it on the side of the ball with fingers up and thumb relaxed, and let it come off as you release.`,
  },
};

function fmt(v, d) { return Number(v).toFixed(d); }

export const COPY = { shooting: SHOOTING_COPY };

/** One set of cut-offs for the overall score, shared by the label and the summary. */
export const scoreBand = (score) => (score >= 70 ? 'good' : score >= 50 ? 'borderline' : 'needs-work');

/** One-line "do this next" per metric, used by the quick summary. */
export const NEXT_STEP = {
  releaseAngle: 'Shoot up, not out: drive through your legs and release at the top.',
  forwardDrift: 'Jump straight up and land on the spot you took off from.',
  elbowAngle: 'Set the ball in a clear L-shape, elbow near 90°, before you extend.',
  kneeDip: 'Sit into the shot a little more so your legs power it.',
  elbowAlignment: 'Keep your elbow under the ball and pointing at the rim.',
  sideDrift: 'Square up, jump straight up and land in the same spot.',
  releaseHeight: 'Release higher: extend fully and let go above your forehead.',
  followThrough: 'Snap your wrist and hold the finish with fingers pointing down.',
  tempo: 'Dip and rise in one smooth motion, no pause at the set point.',
  guideHand: 'Keep your off hand on the side of the ball and let it come off at release.',
};

/**
 * Quick, plain-language summary for under the score: what it means, what works, what to do next.
 * metrics: { id: { score, status } }. Returns { meaning, works, next }.
 */
export function summarize(move, metrics, score) {
  const copy = COPY[move];
  const list = Object.entries(metrics).filter(([, m]) => m.status !== 'unknown');
  const meaning = score >= 85 ? 'Excellent form.' : score >= 70 ? 'Solid form.' : score >= 50 ? 'Getting there.' : 'Early days.';
  const best = list.filter(([, m]) => m.status === 'good').sort((a, b) => b[1].score - a[1].score).slice(0, 2).map(([id]) => copy[id].name.toLowerCase());
  const works = best.length ? `Working well: ${best.join(' and ')}.` : 'Nothing is in the green yet. Pick one fix.';
  const worst = list.filter(([, m]) => m.status !== 'good').sort((a, b) => a[1].score - b[1].score)[0];
  const next = worst ? `Next: ${NEXT_STEP[worst[0]]}` : 'Next: film a few more shots to check this is repeatable.';
  return { meaning, works, next };
}

/** Template advice for every metric. Returns { metricId: string }. */
export function templateAdvice(move, metrics, ranges) {
  const out = {};
  for (const [id, res] of Object.entries(metrics)) {
    out[id] = res.status === 'unknown' || !Number.isFinite(res.value)
      ? `We couldn't measure ${COPY[move][id].name.toLowerCase()} on this clip. Make sure your whole body and shooting arm are clearly visible and try again.`
      : COPY[move][id].improve(res.value, ranges[id], res);
  }
  return out;
}

/**
 * Optionally ask a small LLM (via your own proxy) for friendlier advice. Only numbers are sent, never video.
 * Any failure falls back silently to the template text.
 */
export async function personalisedAdvice(move, metrics, ranges, cfg, fetchImpl = fetch) {
  const base = templateAdvice(move, metrics, ranges);
  const url = cfg.llm && cfg.llm.proxyUrl;
  if (!url) return base;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.llm.timeoutMs || 6000);
  try {
    const body = { move, metrics: Object.fromEntries(Object.entries(metrics).map(([id, m]) => [id, { name: COPY[move][id].name, value: +Number(m.value).toFixed(2), unit: m.unit, status: m.status, good: ranges[id].good }])) };
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) return base;
    const data = await res.json();
    const merged = { ...base };
    for (const id of Object.keys(base)) if (typeof data.advice?.[id] === 'string' && data.advice[id].length < 400) merged[id] = data.advice[id];
    return merged;
  } catch { return base; } finally { clearTimeout(timer); }
}
