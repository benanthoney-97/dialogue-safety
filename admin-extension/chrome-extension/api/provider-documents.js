const supabase = require('./supabase-client');

/**
 * Fetches metadata for a single provider document.
 * @param {number|string} documentId
 * @param {number|string} providerId
 * @returns {Promise<Object|null>}
 */
async function getProviderDocument(documentId, providerId) {
  if (!documentId) {
    return null;
  }

  const { data, error } = await supabase
    .from('provider_documents')
    .select('id, provider_id, title, source_url, media_type, cover_image_url, is_active')
    .eq('id', documentId)
    .eq('provider_id', providerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  getProviderDocument
};
