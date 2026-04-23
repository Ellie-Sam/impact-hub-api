const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.BASE_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const TABLES = ['Participants','Programs','Sessions','Grants','Testimonials','Surveys'];

async function fetchTable(tableName) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}?pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

async function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', chunk => { b += chunk.toString(); });
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);

      // Handle approve grant → create Airtable record
      if (body.action === 'approve_grant') {
        const { funder_name, deadline, amount, focus_areas, key_requirements, url: funderUrl, fit_score } = body;
        const fields = {
          funder_name: funder_name || 'Unknown',
          status: 'Prospecting',
          focus_areas: Array.isArray(focus_areas) ? focus_areas.join(', ') : (focus_areas || ''),
          eligibility_notes: key_requirements || '',
          funder_website: funderUrl || '',
        };
        if (deadline) fields.deadline = deadline;
        if (amount) {
          const num = parseInt(String(amount).replace(/[^0-9]/g, ''));
          if (!isNaN(num)) fields.funding_requested = num;
        }

        const atRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Grants`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields })
        });
        const atData = await atRes.json();
        if (atData.error) return res.status(400).json({ error: atData.error });
        return res.status(200).json({ success: true, record_id: atData.id });
      }

      // Handle generate narrative
      if (body.action === 'generate_narrative' || body.prompt) {
        const prompt = body.prompt || '';
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const aiData = await aiRes.json();
        const text = aiData.content?.[0]?.text;
        if (!text) return res.status(500).json({ error: 'No text in AI response', raw: aiData });
        return res.status(200).json({ text });
      }

      return res.status(400).json({ error: 'Unknown action' });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET — fetch all tables
  try {
    const results = await Promise.allSettled(TABLES.map(t => fetchTable(t)));
    const data = {};
    TABLES.forEach((name, i) => {
      data[name.toLowerCase()] = results[i].status === 'fulfilled' ? (results[i].value.records || []) : [];
    });
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
