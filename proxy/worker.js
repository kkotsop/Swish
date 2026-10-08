// Optional LLM proxy for Swish (Cloudflare Worker). Keeps the Groq API key off the phone.
// Deploy:  npx wrangler deploy proxy/worker.js --name swish-advice --compatibility-date 2024-11-01
//          npx wrangler secret put GROQ_API_KEY --name swish-advice
// Then set "llm.proxyUrl" in config/settings.json to the worker URL. Only metric numbers are sent, never video.
// Only these sites may call the proxy (browsers enforce it); add your own domain if you host Swish elsewhere.
const ALLOWED = ['https://kkotsop.github.io', 'http://localhost:8000'];
const corsFor = (req) => {
  const origin = req.headers.get('origin') || '';
  return { 'access-control-allow-origin': ALLOWED.includes(origin) ? origin : ALLOWED[0], vary: 'origin', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
};

export default {
  async fetch(req, env) {
    const cors = corsFor(req);
    if (!ALLOWED.includes(req.headers.get('origin') || '')) return new Response('forbidden', { status: 403, headers: cors });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
    let body;
    try { body = await req.json(); } catch { return new Response('bad json', { status: 400, headers: cors }); }
    const metrics = body && body.metrics;
    if (!metrics || typeof metrics !== 'object' || Object.keys(metrics).length > 12) return new Response('bad request', { status: 400, headers: cors });
    // keep only the expected fields, so nothing else can be smuggled into the prompt
    const clean = {};
    for (const [id, m] of Object.entries(metrics)) {
      if (!/^[a-zA-Z]{1,24}$/.test(id) || !m || typeof m !== 'object') return new Response('bad request', { status: 400, headers: cors });
      clean[id] = { name: String(m.name || id).slice(0, 40), value: Number(m.value), unit: String(m.unit || '').slice(0, 12), status: String(m.status || '').slice(0, 12), good: Array.isArray(m.good) ? m.good.slice(0, 2).map(Number) : [] };
    }
    const prompt = `You are a friendly, concise basketball shooting coach. For each metric below give ONE or TWO short sentences of advice that mention the player's actual number and the target range. Be encouraging, concrete and specific. Reply with JSON only: {"advice": {"<metricId>": "<text>"}}.\n\n${JSON.stringify(clean)}`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', temperature: 0.4, max_tokens: 700, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return new Response('upstream error', { status: 502, headers: cors });
    const data = await res.json();
    let advice = {};
    try { advice = JSON.parse(data.choices[0].message.content).advice || {}; } catch { /* fall back to templates in the app */ }
    return new Response(JSON.stringify({ advice }), { headers: { ...cors, 'content-type': 'application/json' } });
  },
};
