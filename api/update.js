const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const iconv = require('iconv-lite');

module.exports = async function handler(req, res) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  const results = [];
  for (const type of ['n3', 'n4']) {
    const digits = type === 'n3' ? 3 : 4;
    const url = type === 'n3'
      ? 'https://loto-life.net/csv/numbers3'
      : 'https://loto-life.net/csv/numbers4';
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) { results.push({ type, status: 'fetch_failed' }); continue; }
      const buffer = await response.buffer();
      const text = iconv.decode(buffer, 'shift-jis');
      const lines = text.split('\n').filter(function(l) { return l.trim(); }).slice(1);
      const data = [];
      for (const line of lines) {
        const cols = line.split(',');
        if (cols.length < 3) continue;
        const drawNo = parseInt(cols[0].replace(/"/g, '').trim()) || null;
        const dateStr = cols[1].replace(/"/g, '').trim();
        const raw = cols[2].replace(/"/g, '').replace(/=/g, '').trim();
        let num = raw.replace(/\D/g, '').padStart(digits, '0').slice(0, digits);
        if (num.length !== digits) continue;
        const ds = num.split('').map(Number);
        const total = ds.reduce(function(a, b) { return a + b; }, 0);
        data.push({
          type, draw_no: drawNo, draw_date: dateStr, number: num,
          d1: ds[0], d2: ds[1], d3: ds[2],
          d4: digits === 4 ? ds[3] : null, total
        });
      }
      if (data.length === 0) { results.push({ type, status: 'no_data' }); continue; }
      const { error } = await supabase
        .from('numbers_results')
        .upsert(data, { onConflict: 'type,draw_no', ignoreDuplicates: true });
      results.push({ type, status: error ? 'db_error' : 'success', count: data.length });
    } catch(err) {
      results.push({ type, status: 'error', error: err.message });
    }
  }
  return res.status(200).json({ success: true, results });
};
