import { supabase, openai } from '../lib/clients.mjs'

export async function searchKnowledgeBase(query, providerId) {
  console.log(`🧮 Generating Vectors for: "${query.substring(0, 30)}..."`)

  // 1. Generate Embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query.substring(0, 8000), 
  })
  const vector = embeddingResponse.data[0].embedding

  // 2. Search Supabase
  console.log(`🗄️ Querying Provider Knowledge...`)
  const { data: documents } = await supabase.rpc('match_documents', {
    query_embedding: vector,
    match_threshold: 0.3,
    match_count: 5, // Optimized for chat context
    filter_provider_id: providerId 
  })

  // 3. Format Documents for the AI (Prompt Context)
  const contextText = documents?.map(doc => {
    const title = doc.document_title || "Unknown Source"
    
    // Timestamp Logic
    if (doc.metadata && doc.metadata.timestampStart !== undefined) {
      const startMin = Math.floor(doc.metadata.timestampStart / 60)
      const startSec = Math.floor(doc.metadata.timestampStart % 60).toString().padStart(2, '0')
      return `[SOURCE: ${title}]\n[TIMESTAMP: ${startMin}:${startSec}]\nCONTENT: ${doc.content}\n-----------------`
    }
    
    return `[SOURCE: ${title}]\nCONTENT: ${doc.content}\n-----------------`
  }).join("\n\n") || ""

  // 4. Format Sources for the Frontend (UI Cards)
  const sourceDocs = documents?.map(d => ({
    id: d.document_id,
    title: d.document_title,
    source_url: d.source_url,
    media_type: d.media_type,
    cover_image_url: d.cover_image_url,
    content: d.content // Crucial for Deep Links
  })) || []

  return { hasKnowledge: documents && documents.length > 0, contextText, sourceDocs }
}