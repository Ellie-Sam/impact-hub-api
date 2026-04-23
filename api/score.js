const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const ORG_PROFILE = `Austin AI Hub: 501c3 nonprofit, Austin TX, founded 2025. Mission: AI education for everyone and AI for social good. Programs: AI workshops for beginners, networking events, hackathons, anti-trafficking AI tools, mentorship. Best fits: AI/tech education, workforce development, community development, STEM, social good. Grant range: $5k-$100k.`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let title, description, funder, deadline, amount, source;

    if (req.method === 'GET') {
      ({ title, description, funder, deadline, amount, source } = req.query);
    } else {
      const body = await new Promise((resolve) => {
        let b = '';
        req.on('data', chunk => { b += chunk.toString(); });
        req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
      });
      ({ title, description, funder, deadline, amount, source } = body);
    }

    if (!title && !description) {
      return res.status(400).json({ error: 'title or description required' });
    }

    const prompt = `Rate this grant opportunity for: ${ORG_PROFILE}

Grant: ${title || ''} by ${funder || 'Unknown'}
${description || ''}

Reply with ONLY this JSON (no other text):
{"fit_score":8,"fit_reason":"One sentence why","focus_areas":["tag1","tag2"],"recommendation":"approve","key_requirements":"One sentence about eligibility"}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '{}';

    let result;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      result = JSON.parse(clean);
    } catch {
      result = { fit_score: 5, fit_reason: text.slice(0, 100), recommendation: 'maybe', focus_areas: [] };
    }

    return res.status(200).json({
      ...result,
      grant: { title, funder, deadline, amount, source, description }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, key_present: !!ANTHROPIC_KEY });
  }
};
