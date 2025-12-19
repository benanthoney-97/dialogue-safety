import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import path from 'path'

// Load .env from the root directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// CONFIGURATION
const supabase = createClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- DATA TO INJECT ---
const KNOWLEDGE_BASE = [
  // 1. Orion Legal (unchanged)
  {
    providerName: "Orion Legal",
    docs: [
      {
        title: "Internal Memo: SaaS Indemnity Standards",
        content: "Warning: Never accept standard 'AS-IS' indemnification from SaaS vendors. We strictly require uncapped liability for IP infringement and GDPR breaches. If a vendor refuses, flag as HIGH RISK."
      },
      {
        title: "Precedent: Data Ownership Clauses",
        content: "Client data must remain the property of the Client. Any clause granting the vendor 'derivative rights' to train their AI models on Client Data must be struck out immediately."
      },
      {
        title: "Risk Protocol: Auto-Renewal Terms",
        content: "Any contract with 'Automatic Renewal' without a 30-day notice period is a red flag. We require affirmative consent for renewal or a simplified cancellation mechanism."
      }
    ]
  },
  // 2. GreenField Research (unchanged)
  {
    providerName: "GreenField Research",
    docs: [
      {
        title: "Investment Thesis: The PLG Multiplier",
        content: "We value Product-Led Growth (PLG) motions 3x higher than Sales-Led motions. Look for transparent pricing, self-serve trials, and 'land-and-expand' usage metrics. Hidden pricing is a negative signal."
      },
      {
        title: "Benchmark: Net Revenue Retention (NRR)",
        content: "Top-quartile SaaS companies maintain >120% NRR. If a company does not display their retention metrics or customer expansion stories, assume their churn is high (bad investment)."
      },
      {
        title: "Market Signal: Founder-Led Sales",
        content: "In Seed to Series A stages, we look for Founder-Led sales. If a startup has hired a VP of Sales too early (before $1M ARR), it often indicates a lack of product-market fit."
      }
    ]
  },
  // 3. TMC (The Midnight Club) - NEW! 🚀
  {
    providerName: "TMC", 
    docs: [
      {
        title: "STRATEGY UPDATE: Q3 Trend Monitor - 'Low Profile' Market Saturation",
        content: `
# TMC STRATEGY UNIT - WEEKLY BRIEF
**CLIENT:** Adidas Originals (Global)
**TOPIC:** Competitive Response to "Slim Silhouette" Saturation

## 1. MARKET OBSERVATION
The "Low Profile/Terrace" trend (which we own via Samba/Gazelle) is becoming highly saturated.
* **New Entries:** Puma "H-Street" and various "Speedcat" iterations are gaining media traction (e.g., Kith partnership).
* **Risk:** The market is flooding with "racing" aesthetics, risking trend fatigue for our core icons.

## 2. STRATEGIC STANCE
We do not need to fight for a trend we already won.
* **TMC Recommendation:** Maintain confidence in Samba, but do not aggressively chase the "racing" micro-trend. It is likely short-lived.
* **Pivot Opportunity:** Use this saturation to our advantage by beginning to seed the **"Chunk/Skate"** aesthetic (Campus 00s, Superstar) earlier than planned. Offer the consumer an alternative silhouette to the "slim" look everyone else is copying.

## 3. PARTNERSHIP NOTE (KITH)
Kith's focus on the Puma H-Street release indicates they are diversifying their "retro" offering.
* **Action:** Monitor Kith's social engagement on this drop. If engagement is high, we may need to refresh the creative on our next Samba drop to emphasize "Originality" rather than just "Style," reminding the consumer who started this wave.
        `
      }
    ]
  }
]

async function seed() {
  console.log("\n🌱 SEEDING KNOWLEDGE BASE...\n")

  // Verify connection
  const { data: test, error } = await supabase.from('providers').select('count').single()
  if (error) {
    console.error("❌ Database Connection Failed:", error.message)
    process.exit(1)
  }

  for (const group of KNOWLEDGE_BASE) {
    console.log(`Processing Provider: ${group.providerName}...`)

    // 1. Get Provider ID
    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('name', group.providerName)
      .single()

    if (!provider) {
      console.log(`   ⚠️  Provider '${group.providerName}' not found. Skipping.`)
      continue
    }

    // 2. Clear old knowledge (Keeps DB clean)
    await supabase.from('provider_knowledge').delete().eq('provider_id', provider.id)

    // 3. Vectorize and Insert
    for (const doc of group.docs) {
      process.stdout.write(`   - Embedding "${doc.title.substring(0, 30)}..." `)

      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: doc.content,
        })
        const vector = embeddingResponse.data[0].embedding

        const { error: insertError } = await supabase.from('provider_knowledge').insert({
          provider_id: provider.id,
          title: doc.title,
          content: doc.content,
          embedding: vector
        })

        if (insertError) {
          console.log("❌ DB Error")
          console.error(insertError)
        } else {
          console.log("✅ Done")
        }
      } catch (err) {
        console.log("❌ API Error")
        console.error(err.message)
      }
    }
  }

  console.log("\n✨ Seeding Complete! You can now test the RAG pipeline.\n")
}

seed()