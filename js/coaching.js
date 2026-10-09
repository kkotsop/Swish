// Coaching copy per metric (what / why / how to improve) + personalised advice text.
// Template sentences always work offline; an optional LLM proxy can replace the "improve" text.
/** How the metrics are grouped on the report. */
export const CATEGORIES = [
  { id: 'shot', name: 'Shot mechanics' },
  { id: 'base', name: 'Legs & balance' },
  { id: 'rhythm', name: 'Timing' },
];
const CAT = { releaseAngle: 'shot', elbowAlignment: 'shot', releaseHeight: 'shot', guideHand: 'shot',
  kneeDip: 'base', forwardDrift: 'base', stance: 'base', tempo: 'rhythm', legArmTiming: 'rhythm' };

export const SHOOTING_COPY = {
  releaseAngle: {
    name: 'Release angle', short: 'Release',
    what: 'How steeply your shooting arm points, measured from the horizontal, at the moment it is fully extended and the ball leaves your hand.',
    why: 'A flat arm pushes the ball forward on a low line, so you need a perfect aim to score. A steeper arm gives a high, soft arc with a bigger target, so steeper is never a problem.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your arm is ${fmt(v, 0)}° above horizontal when the ball leaves your hand, ${v >= 60 ? 'a high, soft arc' : `above the ${r.good[0]}° line`}. Keep driving up through the ball.`
      : `Your arm is only ${fmt(v, 0)}° above horizontal when the ball leaves your hand; aim for ${r.good[0]}° or steeper. That is a push forward. Drive up through your legs, get the ball above your forehead and finish with the arm pointing up at the rim, not out at it.`,
  },
  forwardDrift: {
    name: 'Forward drift', short: 'Balance',
    what: 'How far your hips travel between where you started (before the dip) and where you land, in shin lengths. The camera\u2019s own movement is taken out, so it also works when the phone follows you.',
    why: 'Drifting through the shot throws off your balance and your aim. Good shooters jump straight up and land close to where they started.',
    improve: (v, r, res) => res.status === 'good'
      ? `You landed ${fmt(v, 2)} shin lengths ${res.note} of where you started. Great balance, you land where you launched.`
      : `You landed ${fmt(v, 2)} shin lengths ${res.note} of where you started (see the faint figure); aim for under ${r.good[1]}. Jump straight up, keep your core tight and land on the spot you took off from.`,
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
  tempo: {
    name: 'Shot tempo', short: 'Tempo',
    what: 'The time from starting your load to releasing the ball.',
    why: 'A slow shot gives defenders time to close out. A quick, smooth shot is never a problem, so only a slow one is flagged.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your shot takes ${fmt(v, 2)} s from load to release. Quick and smooth.`
      : `Your shot takes ${fmt(v, 2)} s; aim for under ${r.good[1]} s. Dip and rise in one fluid motion without pausing at the set point.`,
  },
  legArmTiming: {
    name: 'Leg-to-arm timing', short: 'Timing',
    what: 'The gap between your legs finishing their push and your shooting arm finishing its extension.',
    why: 'When the legs and arm work as one motion, the power flows up into the ball. A gap makes the shot two separate parts and costs rhythm and range.',
    improve: (v, r, res) => res.status === 'good'
      ? `Your arm and legs finish within ${fmt(v, 2)} s of each other, one smooth motion.`
      : res.signed > 0
        ? `Your arm finishes ${fmt(v, 2)} s after your legs; aim for under ${r.good[1]} s. Start extending the arm while your legs are still pushing, with no pause at the set point.`
        : `Your arm finishes ${fmt(v, 2)} s before your legs; aim for under ${r.good[1]} s. Let the legs lead and the arm follow them up.`,
  },
  stance: {
    name: 'Stance width', short: 'Stance',
    what: 'How far apart your feet are before you shoot, compared with your shoulder width. Only measured from the front: from the side the gap points at the camera.',
    why: 'Feet about shoulder width apart give a stable base. Too close together and you wobble (the bigger problem), too wide and you lose the power from your legs.',
    improve: (v, r, res) => {
      const u = 'shoulder widths', est = '';
      return res.status === 'good'
        ? `Your feet are ${fmt(v, 2)} ${u} apart${est}, a stable base.`
        : v < r.good[0]
          ? `Your feet are ${fmt(v, 2)} ${u} apart${est}; aim for ${r.good[0]}–${r.good[1]}. Step them out to about shoulder width or a little wider, so you have a steady base.`
          : `Your feet are ${fmt(v, 2)} ${u} apart${est}; aim for ${r.good[0]}–${r.good[1]}. Bring them in a little so your legs can push straight up.`;
    },
  },
  guideHand: {
    name: 'Guide hand', short: 'Off hand',
    what: 'How far your off hand is below your shooting hand as the ball leaves and just after, in forearm lengths. Zero means level with the shooting hand; higher means the off hand has dropped.',
    why: 'The off hand should steady the ball from the side and stay up with the shooting hand through the release. If it drops away while the shooting hand is still up it cannot guide the ball, and if it pushes it adds sidespin and misses left or right.',
    improve: (v, r, res) => res.status === 'good'
      ? `As the ball leaves and just after, your off hand stays up with your shooting hand (${fmt(v, 1)} forearms below it; aim for no more than ${r.good[1]}).`
      : `As the ball leaves and just after, your off hand is ${fmt(v, 1)} forearms below your shooting hand; aim for no more than ${r.good[1]}. It has dropped away. Keep it up on the side of the ball with fingers up and thumb relaxed, and let it stay up until the ball is gone.`,
  },
};

function fmt(v, d) { return Number(v).toFixed(d); }

for (const id of Object.keys(SHOOTING_COPY)) SHOOTING_COPY[id].cat = CAT[id];
export const COPY = { shooting: SHOOTING_COPY };

/** One set of cut-offs for the overall score, shared by the score label and the meter. */
export const scoreBand = (score) => (score >= 70 ? 'good' : score >= 50 ? 'borderline' : 'needs-work');

/** Template advice for every metric. Returns { metricId: string }. */
export function templateAdvice(move, metrics, ranges) {
  const out = {};
  for (const [id, res] of Object.entries(metrics)) {
    out[id] = res.status === 'unknown' || !Number.isFinite(res.value)
      ? res.reason || `We couldn't measure ${COPY[move][id].name.toLowerCase()} on this clip. Make sure your whole body and shooting arm are clearly visible and try again.`
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
    const body = { move, metrics: Object.fromEntries(Object.entries(metrics).filter(([, m]) => m.status !== 'unknown').map(([id, m]) => [id, { name: COPY[move][id].name, value: +Number(m.value).toFixed(2), unit: m.unit, status: m.status, good: ranges[id].good }])) };
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) return base;
    const data = await res.json();
    const merged = { ...base };
    for (const id of Object.keys(base)) if (typeof data.advice?.[id] === 'string' && data.advice[id].length < 400) merged[id] = data.advice[id];
    return merged;
  } catch { return base; } finally { clearTimeout(timer); }
}
