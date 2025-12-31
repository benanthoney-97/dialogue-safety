import { supabase } from '../lib/clients.mjs'
import { searchKnowledgeBase } from '../services/retrieval.mjs'
import { generateAdvice } from '../services/generation.mjs'

export const analyzeController = async (req, res) => {
  try {
    const { text, messages, scanType, providerId, forceFallback } = req.body

    // --- 🕵️‍♂️ 1. DEBUG: INPUT VALIDATION ---
    console.log(`\n===================================================`)
    console.log(`📥 NEW REQUEST RECEIVED`)
    console.log(`   - Scan Type: ${scanType}`)
    console.log(`   - Provider ID: ${providerId}`)
    console.log(`   - Messages Array Length: ${messages ? messages.length : 0}`)
    
    // DETERMINE CURRENT QUERY
    let currentQuery = text
    if (!currentQuery && messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.role === 'user') {
        currentQuery = lastMessage.content
      }
    }
    console.log(`   - Active Query: "${currentQuery?.slice(0, 50)}..."`)
    console.log(`===================================================\n`)

    if (!currentQuery) return res.status(400).json({ error: "No query provided" })

    // 2. FETCH PROVIDER
    const { data: provider } = await supabase
      .from('providers') 
      .select(`name, provider_types (system_prompt)`)
      .eq('id', providerId)
      .single()

    if (!provider) return res.status(404).json({ error: "Provider not found" })
    
    // @ts-ignore
    const systemPrompt = provider.provider_types?.system_prompt || "You are a helpful assistant."

    // 3. RETRIEVE KNOWLEDGE (Based on CURRENT query only)
    const { hasKnowledge, contextText, sourceDocs } = await searchKnowledgeBase(currentQuery, providerId)

    // 4. STOP IF NO MATCH (Unless it's a chat or forced)
    if (!hasKnowledge && !forceFallback && scanType !== 'chat') {
      console.log("⚠️ No matches. Asking for confirmation.")
      return res.json({ match: false, advice: null, requiresConfirmation: true })
    }

    // 5. GENERATE ADVICE
    const advice = await generateAdvice({
      query: currentQuery,
      history: messages || [], 
      contextText,
      systemPrompt,
      providerName: provider.name,
      scanType
    })

    // 6. RESPOND
    res.json({ 
      match: hasKnowledge, 
      advice: advice,
      requiresConfirmation: false,
      sources: sourceDocs 
    })

  } catch (err) {
    console.error("❌ Controller Error:", err)
    res.status(500).json({ error: "Analysis failed" })
  }
}