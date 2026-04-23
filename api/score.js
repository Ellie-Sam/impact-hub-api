const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const ORG_PROFILE = `
Organization: Austin AI Hub
Type: 501(c)(3) nonprofit, founded 2025
Location: Austin, Texas (also serves online nationwide)
Mission: Make AI education accessible to everyone and apply AI for social good
Members: 500+ including beginners, engineers, educators, healthcare workers, students, career changers
Programs: AI For Everyone Workshop Series, AI After Hours networking, AI Innovation Challenge hackathons, AI for Social Good (anti-trafficking tools), Chai Chat Mentorship
Best grant fits: AI/technology education, workforce development, community development, STEM education, social good/anti-trafficking, diversity in tech
Typical grant size: $5,000 - $100,000
Geographic focus: Austin TX, Greater Austin, Texas, nationwide (online programs)
`;

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

    const prompt = `You are a grant fit evaluator for a nonprofit organization.

Here is the organization profile:
${ORG_PROFILE}

Here is a grant opportunity to evaluate:
Title: ${title || 'Unknown'}
Funder: ${funder || 'Unknown'}
Amount: ${amount || 'Unknown'}
Deadline: ${deadline || 'Unknown'}
Source: ${source || 'Unknown'}
Description: ${description || 'No description provided'}

Evaluate how well this grant fits the organization. Respond in JSON only with this exact structure:
{
  "fit_score": <number 1-10>,
  "fit_reason": "<one sentence explaining the score>",
  "focus_areas": ["<tag1>", "<tag2>"],
  "recommendation": "approve" | "maybe" | "skip",
  "key_requirements": "<any important eligibility notes in one sentence>"
}

Scoring guide:
9-10: Perfect fit
7-8: Strong fit
5-6: Partial fit
3-4: Weak fit
1-2: No fit

Respond with JSON only. No other text.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '{}';

    let result;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      result = JSON.parse(clean);
    } catch {
      result = { fit_score: 5, fit_reason: 'Could not parse AI response', recommendation: 'maybe' };
    }

    return res.status(200).json({
      ...result,
      grant: { title, funder, deadline, amount, source, description }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
