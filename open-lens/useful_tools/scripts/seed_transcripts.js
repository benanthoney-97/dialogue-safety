require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

// --- CONFIGURATION ---
const PROVIDER_ID = 5; // The Careers Edit
const INPUT_DIR = './transcripts';
const MIN_CHUNK_LENGTH = 800;
const MAX_CHUNK_LENGTH = 2000;

// Initialize Clients
const supabase = createClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY 
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

function chunkTranscript(segments) {
  const chunks = [];
  let currentChunkText = "";
  let currentStartTime = segments[0]?.start || 0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentChunkText += (currentChunkText ? " " : "") + segment.text;

    if (currentChunkText.length >= MIN_CHUNK_LENGTH) {
      const isEndOfSentence = /[.!?]$/.test(segment.text.trim());
      if (isEndOfSentence || currentChunkText.length >= MAX_CHUNK_LENGTH) {
        chunks.push({
          content: currentChunkText,
          metadata: {
            timestampStart: Math.floor(currentStartTime),
            timestampEnd: Math.ceil(segment.end)
          }
        });
        currentChunkText = "";
        currentStartTime = segments[i + 1]?.start || segment.end;
      }
    }
  }
  if (currentChunkText.length > 100) {
    chunks.push({
      content: currentChunkText,
      metadata: {
        timestampStart: Math.floor(currentStartTime),
        timestampEnd: Math.ceil(segments[segments.length - 1].end)
      }
    });
  }
  return chunks;
}

async function processFile(filename) {
  console.log(`\n📄 Processing: ${filename}`);
  const filePath = path.join(INPUT_DIR, filename);
  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const cleanTitle = filename.replace('.mp3.json', '').replace('.json', '');

  // --- STEP 1: CREATE PARENT DOCUMENT ---
  console.log(`   📚 Creating Document Entry: "${cleanTitle}"...`);
  
  // Optional: Add URL mapping logic here if you want specific YouTube URLs
  const sourceUrl = ""; 

  const { data: docData, error: docError } = await supabase
    .from('provider_documents')
    .insert({
      provider_id: PROVIDER_ID,
      title: cleanTitle,
      media_type: 'video',
      source_url: sourceUrl
    })
    .select()
    .single();

  if (docError) {
    console.error("   ❌ Error creating document:", docError);
    return;
  }
  
  const documentId = docData.id;

  // --- STEP 2: CREATE CHUNKS ---
  const chunks = chunkTranscript(rawData.segments);
  console.log(`   👉 Created ${chunks.length} chunks. Uploading...`);

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk.content);

    const { error } = await supabase.from('provider_knowledge').insert({
      document_id: documentId, // Link to parent
      provider_id: PROVIDER_ID, // (Optional redundancy, but good for RLS)
      content: chunk.content,
      embedding: embedding,
      metadata: chunk.metadata // Contains timestamps
    });

    if (error) console.error(`   ❌ Chunk Error:`, error);
  }
  console.log(`   ✅ Done with ${cleanTitle}`);
}

(async () => {
  const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    await processFile(file);
  }
  console.log("\n🎉 All transcripts seeded successfully!");
})();