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
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
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
      const prompt = body.prompt || '';
      if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const aiData = await aiRes.json();
      const text = aiData.content?.[0]?.text;
      if (!text) return res.status(500).json({ error: 'No text in response', raw: aiData });
      return res.status(200).json({ text });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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
