const supabase = require('./supabase-client');

const parseMetadata = (metadata) => {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
};

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const knowledgeId = Number(requestUrl.searchParams.get('knowledge_id') || '');

  if (!knowledgeId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'knowledge_id is required' }));
    return;
  }

  try {
    const { data, error } = await supabase
      .from('provider_knowledge')
      .select('metadata, content')
      .eq('id', knowledgeId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Provider knowledge not found' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(
      JSON.stringify({
        metadata: parseMetadata(data.metadata),
        content: data.content || ''
      })
    );
  } catch (err) {
    console.error('[provider-knowledge] handler error', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = handler;
