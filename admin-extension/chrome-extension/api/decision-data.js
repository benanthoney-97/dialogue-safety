const supabase = require('./supabase-client');
const { getProviderDocument } = require('./provider-documents');

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

async function lookupKnowledge(knowledgeId) {
  if (!knowledgeId) return null;
  const { data, error } = await supabase
    .from('provider_knowledge')
    .select('metadata, content')
    .eq('id', knowledgeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const metadata = parseMetadata(data?.metadata);
  const payload = {
    metadata,
    content: data?.content || ''
  };
  console.log(`[decision-data] fetched knowledge ${knowledgeId}`, payload);
  return payload;
}

async function getPageMatchById(pageMatchId) {
  if (!pageMatchId) return null;
const { data, error } = await supabase
    .from('page_matches')
    .select('*')
    .eq('id', pageMatchId)
    .maybeSingle();

  if (error) throw error;
  console.log("[decision-data] fetched page_match", data);
  return data;
}

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const providerId = Number(requestUrl.searchParams.get('provider_id') || '');
    const documentId = Number(requestUrl.searchParams.get('document_id') || '');
    const knowledgeId = Number(requestUrl.searchParams.get('knowledge_id') || '');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const payload = {
      title: '',
      video_url: '',
      cover_image_url: '',
      is_active: null,
      source_url: '',
      document_id: null
    };

    let documentRow = null;
    const applyDocumentInfo = (doc) => {
      if (!doc) return;
      payload.title = payload.title || doc.title || '';
      payload.cover_image_url = payload.cover_image_url || doc.cover_image_url || '';
      payload.is_active = payload.is_active ?? doc.is_active ?? null;
      payload.source_url = payload.source_url || doc.source_url || '';
      payload.document_id = doc.id ?? payload.document_id;
    };

    if (documentId && providerId) {
      documentRow = await getProviderDocument(documentId, providerId);
      console.log("[decision-data] provider_documents row", documentRow);
      applyDocumentInfo(documentRow);
    }

    let knowledgeMeta = null;
    if (knowledgeId) {
      knowledgeMeta = await lookupKnowledge(knowledgeId);
      if (knowledgeMeta?.metadata) {
        payload.video_url =
          knowledgeMeta.metadata.video_url ||
          knowledgeMeta.metadata.source ||
          knowledgeMeta.metadata.source_url ||
          payload.video_url;
      }
      payload.content = knowledgeMeta?.content || '';
    }

    const pageMatchId = Number(requestUrl.searchParams.get('page_match_id') || '');
    let pageMatch = await getPageMatchById(pageMatchId);
    if (!pageMatch) {
      console.warn("[decision-data] no page_match found for", pageMatchId);
    }

    payload.confidence = pageMatch?.confidence ?? null;
    payload.phrase = pageMatch?.phrase || payload.phrase;
    payload.page_match_id = pageMatch?.id ?? null;
    payload.video_url = pageMatch?.video_url || payload.video_url;
    payload.content = pageMatch?.transcript || payload.content;

    const matchDocumentId = pageMatch?.document_id ?? documentId;
    if (matchDocumentId && providerId) {
      if (!documentRow || documentRow.id !== matchDocumentId) {
        documentRow = await getProviderDocument(matchDocumentId, providerId);
        console.log("[decision-data] provider_documents row (page match)", documentRow);
      }
      applyDocumentInfo(documentRow);
    } else if (matchDocumentId) {
      payload.document_id = payload.document_id ?? matchDocumentId;
    }

    if (!payload.video_url && knowledgeMeta?.metadata) {
      payload.video_url =
        knowledgeMeta.metadata.video_url ||
        knowledgeMeta.metadata.source ||
        knowledgeMeta.metadata.source_url ||
        payload.video_url;
    }

    console.log(
      `[decision-data] provider_id=${providerId} document_id=${documentId} page_match_id=${payload.page_match_id} knowledge_id=${knowledgeId} -> title='${payload.title}' video='${payload.video_url}' confidence='${payload.confidence}' phrase='${payload.phrase}' content='${payload.content}'`
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('decision-data handler error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
module.exports = handler;
