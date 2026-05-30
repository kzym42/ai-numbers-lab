const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const type = req.query.type || 'n3';
  const limit = parseInt(req.query.limit) || 500;
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    const { data, error } = await supabase
      .from('numbers_results')
      .select('draw_date, number, d1, d2, d3, d4, total')
      .eq('type', type)
      .order('draw_date', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    const formatted = data.map(function(row) {
      return {
        date: row.draw_date,
        number: row.number,
        ds: type === 'n3' ? [row.d1, row.d2, row.d3] : [row.d1, row.d2, row.d3, row.d4],
        total: row.total,
        hit: false
      };
    });
    return res.status(200).json({ success: true, data: formatted });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
