const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const ORG_PROFILE = `
Organization: Austin AI Hub
Type: 501(c)(3) nonprofit, founded 2025
Location: Austin, Texas (also serves online nationwide)
Mission: Make AI education accessible to everyone and apply AI for social good
Members: 500+ including beginners, engineers, educators, healthcare workers, students, career changers

Programs:
- AI For Everyone Workshop Series: Hands-on AI workshops, no coding required, led by PhD researchers
- AI After Hours: In-person networking events in Austin
- AI Innovation Challenge: Hackathons where teams build AI solutions to real-world problems
- AI for Social Good: Building AI tools for anti-trafficking nonprofits
- Chai Chat Mentorship: Free 1:1 AI mentorship platform (coming soon)

Best grant fits:
- AI / technology education
- Workforce development and career training
- Community development and access for underserved populations
- STEM education
- Social good, anti-trafficking, nonprofit capacity building
- Diversity and inclusion in tech

Typical grant size: $5,000 - $100,000
Geographic focus: Austin TX, Greater Austin area, Texas, nationwide (for online programs)
`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await new Promise((resolve) => {
      let b = '';
      req.on('data', chunk => { b += chunk.toString(); });
      req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    });

    const { title, description, funder, deadline, amount, source } = body;

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
9-10: Perfect fit — mission, geography, programs align exactly
7-8: Strong fit — most criteria match
5-6: Partial fit — some alignment but notable gaps
3-4: Weak fit — minor relevance only
1-2: No fit — different mission or ineligible

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
      result = JSON.parse(text);
    } catch {
      result = { fit_score: 0, fit_reason: 'Could not parse AI response', recommendation: 'skip' };
    }

    return res.status(200).json({
      ...result,
      grant: { title, funder, deadline, amount, source, description }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
