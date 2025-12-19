import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import Parser from "rss-parser"
import * as dotenv from "dotenv"
import path from "path"

// 1. Force load .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") })

// 2. Setup Client
const supabaseUrl = process.env.PLASMO_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ Fatal Error: Could not find Supabase URL or Key in .env file.")
}

const supabase = createClient(supabaseUrl, supabaseKey)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const parser = new Parser()

// --- CONFIGURATION ---
const RSS_URL = "https://theraffireport.substack.com/feed"
const PROVIDER_ID = 7 // "The Raffi Report"
const PROVIDER_NAME = "The Raffi Report"

async function seed() {
  console.log(`\n🔎 STARTING FEED INGESTION...`)
  console.log(`Targeting Provider: ${PROVIDER_NAME} (ID: ${PROVIDER_ID})`)
  
  // 1. Fetch RSS
  console.log(`🌱 Fetching feed from ${RSS_URL}...`)
  const feed = await parser.parseURL(RSS_URL)
  console.log(`Found ${feed.items.length} articles in feed.`)

  // 2. PROCESS ARTICLES
  for (const item of feed.items) {
    if (!item.title || !item.link) continue

    console.log(`\n------------------------------------------------`)
    console.log(`📄 Processing: ${item.title.substring(0, 50)}...`)

    // A. Upsert Document
    let doc
    const { data: existingDoc } = await supabase
        .from("provider_documents")
        .select("id")
        .eq("source_url", item.link)
        .single()

    // Extract Image from content if available (Substack usually puts it in <figure>)
    const imgMatch = item['content:encoded']?.match(/src="([^"]+)"/)
    const coverImage = imgMatch ? imgMatch[1] : null

    if (existingDoc) {
        console.log(`   Existing Doc Found (ID: ${existingDoc.id})`)
        doc = existingDoc
    } else {
        const { data, error } = await supabase.from("provider_documents").insert({
            provider_id: PROVIDER_ID,
            title: item.title,
            source_url: item.link,
            cover_image_url: coverImage,
            media_type: "article",
            created_at: item.isoDate
        }).select().single()
        
        if (error) {
            console.error(`   ❌ DOC INSERT FAILED: ${error.message}`)
            continue
        }
        console.log(`   ✅ New Doc Created (ID: ${data.id})`)
        doc = data
    }

    // B. Check Vector Count
    const { count } = await supabase
        .from('provider_knowledge')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', doc.id)

    if (count && count > 0) {
        console.log(`   ⏭️  Skipping: ${count} vectors already exist.`)
        continue
    }

    // --- C. CHUNKING LOGIC ---
    const rawContent = item['content:encoded'] || ""
    
    // 1. Preserve structure: Turn <p> and <br> into newlines before stripping tags
    const structuredText = rawContent
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n\n')
        .replace(/<[^>]*>?/gm, ' ') // Strip remaining tags
        .trim()

    // 2. Split by double newlines (paragraphs)
    const rawParagraphs = structuredText.split(/\n\s*\n/)
    
    // 3. Combine paragraphs into meaningful chunks (aim for ~1000 chars)
    const chunks: string[] = []
    let currentChunk = ""

    for (const p of rawParagraphs) {
        const cleanP = p.replace(/\s+/g, ' ').trim() // Clean up inside the paragraph
        if (cleanP.length === 0) continue

        // If adding this paragraph makes it too big, push the current chunk and start new
        if (currentChunk.length + cleanP.length > 1000) {
            if (currentChunk.length > 0) chunks.push(currentChunk)
            currentChunk = cleanP
        } else {
            // Otherwise add to current chunk
            currentChunk = currentChunk ? `${currentChunk}\n\n${cleanP}` : cleanP
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk)

    console.log(`   ⚡ Generated ${chunks.length} chunks. Vectorizing...`)

    // D. Generate Vectors
    for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i]
        
        try {
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunkText,
            })
            
            const vector = embeddingResponse.data[0].embedding
            
            const { error: insError } = await supabase
                .from("provider_knowledge")
                .insert({
                    provider_id: PROVIDER_ID,
                    document_id: doc.id,
                    content: chunkText,
                    embedding: vector,
                    metadata: { 
                        title: item.title, 
                        url: item.link,
                        chunk_index: i 
                    }
                })

            if (insError) console.error(`      ❌ INSERT FAIL: ${insError.message}`)
            else process.stdout.write(".")
            
        } catch (err: any) {
            console.error(`      ❌ OPENAI ERROR: ${err.message}`)
        }
    }
  }

  console.log("\n\n🏁 Raffi Report Ingestion Complete.")
}

seed()