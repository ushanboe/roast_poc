// Vercel Serverless Function: /api/roast
// Accepts: { imageDataUrl, tone }
// Optional: user can provide their own key via header X-User-OpenAI-Key

function bad(res, status, msg, extra) {
  res.status(status).json({ error: msg, ...(extra || {}) });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function extractOutputText(resp) {
  if (typeof resp?.output_text === 'string' && resp.output_text.length) return resp.output_text;
  const out = resp?.output;
  if (Array.isArray(out)) {
    const chunks = [];
    for (const item of out) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if ((c?.type === 'output_text' || c?.type === 'text') && typeof c?.text === 'string') chunks.push(c.text);
      }
    }
    if (chunks.length) return chunks.join('\n');
  }
  if (typeof resp?.text === 'string') return resp.text;
  return '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-OpenAI-Key');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return bad(res, 400, 'bad_json', { message: e?.message || String(e) });
  }

  const imageDataUrl = body?.imageDataUrl;
  const tone = body?.tone || 'Brutal';

  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    return bad(res, 400, 'bad_request', { message: 'imageDataUrl must be a data:image/* data URL' });
  }

  // API key: prefer user-provided, fallback to server env.
  const userKey = req.headers['x-user-openai-key'];
  const apiKey = (typeof userKey === 'string' && userKey.trim()) ? userKey.trim() : process.env.OPENAI_API_KEY;
  if (!apiKey) return bad(res, 500, 'missing_config', { message: 'Missing OPENAI_API_KEY (or provide X-User-OpenAI-Key)' });

  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return bad(res, 400, 'bad_image');
  const mime = match[1];
  const b64 = match[2];

  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  "You are a witty comedian. You roast the USER'S MOBILE SCREENSHOT in a playful, non-hateful way. Never include slurs. Avoid harassment. Do not mention real private data. Do NOT include the app name, headings, or any scores/ratings inside the roast text. If the screenshot appears to include private chats or personal info, warn the user to crop/blur next time and keep the roast generic. Output JSON only."
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Tone: ${tone}. Produce: (1) a short roast (max 4 lines), (2) a score 0-100 (chaosScore), (3) 3 short tags. Return JSON ONLY with exactly these keys: roast, chaosScore, tags.`
              },
              {
                type: 'input_image',
                image_url: `data:${mime};base64,${b64}`
              }
            ]
          }
        ],
        text: { format: { type: 'json_object' } }
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return bad(res, 502, 'upstream_error', { status: resp.status, errText });
    }

    const data = await resp.json();
    const outputText = extractOutputText(data);
    if (!outputText) {
      return res.status(200).json({ roast: '(No text returned from model)', chaosScore: null, tags: [] });
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return res.status(200).json({ roast: outputText, chaosScore: null, tags: [] });
    }

    const roast = (typeof parsed?.roast === 'string' && parsed.roast.trim().length)
      ? parsed.roast
      : '(No roast text returned — try a different screenshot or tone)';

    const chaosScore = Number.isFinite(parsed?.chaosScore) ? parsed.chaosScore : null;
    const tags = Array.isArray(parsed?.tags) ? parsed.tags.slice(0, 6).map(String) : [];

    return res.status(200).json({ roast, chaosScore, tags });
  } catch (e) {
    return bad(res, 500, 'server_error', { message: e?.message || String(e) });
  }
}
