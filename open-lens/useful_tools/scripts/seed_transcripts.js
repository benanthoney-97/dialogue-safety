const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

if (!process.env.PLASMO_PUBLIC_SUPABASE_URL) {
    console.error("❌ ERROR: .env file not loaded correctly.");
    process.exit(1);
}

// --- CONFIGURATION ---
const PROVIDER_ID = 12; 
const INPUT_DIR = './transcripts'; 
const MIN_CHUNK_LENGTH = 800;
const MAX_CHUNK_LENGTH = 2000;

// 🗺️ URL MAPPING
// Map filenames to their source URLs so citations are clickable.
// If a file isn't listed here, it will just default to an empty link.
const URL_MAP = {
  // Example:
  // "Inside Oddbox The CMO Who Helped a Purpose-Driven Brand Become a Growth Machine - Ep 68.mp3.json": "https://youtu.be/..."
};

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
  
  if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found at: ${filePath}`);
      return;
  }

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const cleanTitle = filename.replace('.mp3.json', '').replace('.json', '');

  // Look up URL in the map, otherwise default to empty string
  const sourceUrl = URL_MAP[filename] || "";

  // --- STEP 1: CREATE PARENT DOCUMENT ---
  console.log(`   📚 Creating Document Entry: "${cleanTitle}"...`);
  
  const { data: docData, error: docError } = await supabase
    .from('provider_documents')
    .insert({
      provider_id: PROVIDER_ID,
      title: cleanTitle,
      media_type: 'video', // Assumed video/podcast
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
      document_id: documentId, 
      provider_id: PROVIDER_ID, 
      content: chunk.content,
      embedding: embedding,
      metadata: chunk.metadata 
    });

    if (error) console.error(`   ❌ Chunk Error:`, error);
  }
  console.log(`   ✅ Done with ${cleanTitle}`);
}

(async () => {
  console.log(`📂 Scanning directory: ${INPUT_DIR}`);
  
  // Find all JSON files in the directory
  const files = fs.readdirSync(INPUT_DIR).filter(file => file.endsWith('.json'));

  if (files.length === 0) {
      console.log("⚠️ No .json transcript files found.");
      return;
  }

  console.log(`🔎 Found ${files.length} files to seed.`);

  for (const file of files) {
      await processFile(file);
  }
  
  console.log("\n🎉 Seeding complete!");
})();