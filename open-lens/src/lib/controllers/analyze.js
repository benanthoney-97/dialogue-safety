import { supabase } from '../lib/clients.js'
import { searchKnowledgeBase } from '../services/retrieval.js'
import { generateAdvice } from '../services/generation.js'

export const analyzeController = async (req, res) => {
  try {
    const { text, messages, scanType, providerId, forceFallback } = req.body

    // 1. DETERMINE CURRENT QUERY
    // If 'text' is provided (e.g. from the highlight scan), use it.
    // If not, use the LAST message from the chat history.
    let currentQuery = text
    if (!currentQuery && messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.role === 'user') {
        currentQuery = lastMessage.content
      }
    }

    if (!currentQuery) return res.status(400).json({ error: "No query provided" })

    console.log(`\n---------------------------------------------------`)
    console.log(`🔍 NEW REQUEST: Provider ${providerId} | Type: ${scanType}`)
    console.log(`📝 Query: "${currentQuery.slice(0, 50)}..."`)

    // 2. FETCH PROVIDER
    const { data: provider } = await supabase
      .from('providers') 
      .select(`name, provider_types (system_prompt)`)
      .eq('id', providerId)
      .single()

    if (!provider) return res.status(404).json({ error: "Provider not found" })
    
    // @ts-ignore
    const systemPrompt = provider.provider_types?.system_prompt || "You are a helpful assistant."

    // 3. RETRIEVE KNOWLEDGE (RAG)
    // We only search based on the CURRENT query, not the whole history (saves tokens/noise)
    const { hasKnowledge, contextText, sourceDocs } = await searchKnowledgeBase(currentQuery, providerId)

    // 4. STOP IF NO MATCH (Unless it's a chat or forced)
    if (!hasKnowledge && !forceFallback && scanType !== 'chat') {
      console.log("⚠️ No matches. Asking for confirmation.")
      return res.json({ match: false, advice: null, requiresConfirmation: true })
    }

    // 5. GENERATE ADVICE (LLM)
    const advice = await generateAdvice({
      query: currentQuery,
      history: messages || [], // 👈 PASS FULL HISTORY
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