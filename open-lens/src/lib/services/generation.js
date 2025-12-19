import { geminiModel } from '../lib/clients.js'

export async function generateAdvice({ 
  query, 
  history = [], 
  contextText, 
  systemPrompt, 
  providerName, 
  scanType 
}) {

  // --- HISTORY FORMATTING ---
  // 1. Slice: Take only the last 6 messages to prevent token overflow.
  // 2. Filter: Remove the very last message if it's identical to the 'query' (to avoid repeating it in history + current query)
  const relevantHistory = history
    .slice(-7) 
    .filter(msg => msg.content !== query) 
  
  const historyBlock = relevantHistory.length > 0 
    ? relevantHistory.map(msg => 
        `${msg.role === 'user' ? 'USER' : 'YOU'}: ${msg.content}`
      ).join("\n")
    : "No previous conversation."

  // --- PROMPT ASSEMBLY ---
  const refinedSystemPrompt = systemPrompt.replace(/\[Provider Name\]/g, providerName)

  const rulesBlock = `
    ### KNOWLEDGE & CITATION PROTOCOL
    1. **Primary Source:** You must prioritize Internal Knowledge above general advice.
    2. **Strict Citation Rule:** When you use a concept from the Internal Knowledge, you MUST cite it using the format: [[Source Title, Timestamp: MM:SS]].
    3. **Tone:** Speak naturally as ${providerName}.
  `

  let fullPrompt = ""

  if (scanType === 'chat') {
    fullPrompt = `
      ${refinedSystemPrompt}
      ${rulesBlock}

      ### INTERNAL KNOWLEDGE LIBRARY (Use this first)
      ${contextText}

      ### CONVERSATION HISTORY (Context)
      ${historyBlock}

      ### CURRENT USER QUERY
      "${query}"
      
      ### INSTRUCTION
      Answer the current query. refer to the History if the user asks "what did we just talk about?" or "elaborate on that".
    `
  } else {
    // Audit Mode (Usually no history needed, but good to keep consistent)
    fullPrompt = `
      ${refinedSystemPrompt}
      ${rulesBlock}

      ### TASK
      Analyse the text below. Provide actionable advice.

      ### INPUT TEXT TO AUDIT
      "${query.substring(0, 15000)}"
      
      ### INTERNAL KNOWLEDGE LIBRARY
      ${contextText}
    `
  }

  // --- EXECUTE ---
  console.log(`🤖 CALLING GEMINI... (History Length: ${relevantHistory.length})`)
  
  const result = await geminiModel.generateContent({
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.1,      
      maxOutputTokens: 8192, 
    }
  })

  return result.response.text()
}