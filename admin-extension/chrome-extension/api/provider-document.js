const { getProviderDocument } = require('./provider-documents');

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const documentId = Number(requestUrl.searchParams.get('document_id') || '');
  const providerId = Number(requestUrl.searchParams.get('provider_id') || '');

  if (!documentId || !providerId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'document_id and provider_id are required' }));
    return;
  }

  try {
    const doc = await getProviderDocument(documentId, providerId);
    if (!doc) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Provider document not found' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(doc));
  } catch (err) {
    console.error('[provider-document] handler error', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = handler;
