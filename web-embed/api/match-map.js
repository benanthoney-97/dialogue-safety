const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { getProviderDocument } = require('./provider-documents');

dotenv.config({
  path: path.resolve(__dirname, '..', '..', '.env')
});

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PLASMO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase config');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const vimeoEmbedUrl = (originalUrl = '', timestamp = 0) => {
  if (!originalUrl) return originalUrl;
  const matches = [
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/
  ];
  let videoId = null;
  for (const pattern of matches) {
    const found = originalUrl.match(pattern);
    if (found) {
      videoId = found[1];
      break;
    }
  }
  if (!videoId) return originalUrl;
  const suffix = timestamp ? `#t=${timestamp}s` : '';
  return `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0${suffix}`;
};

const fetchMatches = async (providerId, limit = 50) => {
    const { data, error } = await supabase
      .from('page_matches')
      .select('id, phrase, video_url, confidence, document_id, status')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(limit);

  if (error) {
    throw error;
  }

  const matches = [];
  for (const row of data || []) {
    const embedUrl = vimeoEmbedUrl(row.video_url, 0);

    const match = {
      page_match_id: row.id,
      phrase: row.phrase || '',
      video_url: embedUrl,
      confidence: row.confidence,
      document_id: row.document_id,
      provider_id: providerId,
      status: row.status,
    };

    if (match.document_id) {
      try {
        const doc = await getProviderDocument(match.document_id, providerId);
        if (doc) {
          match.document_title = doc.title || '';
          match.cover_image_url = doc.cover_image_url || '';
        }
      } catch (err) {
        console.error('[match-map] provider_document error', err);
      }
    }

    matches.push(match);
  }

  return matches;
};

async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const providerId = Number(requestUrl.searchParams.get('provider_id') || '');
    if (!providerId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing provider_id' }));
    }

    const matches = await fetchMatches(providerId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(matches));
  } catch (err) {
    console.error('[match-map] handler error', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = handler;
