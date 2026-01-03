const supabase = require('./supabase-client');

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pageMatchId = Number(requestUrl.searchParams.get('page_match_id') || '');
  if (!pageMatchId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'page_match_id is required' }));
    return;
  }

  try {
    const { data, error } = await supabase
      .from('page_matches')
      .select('*')
      .eq('id', pageMatchId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Page match not found' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[page-match] handler error', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = handler;
