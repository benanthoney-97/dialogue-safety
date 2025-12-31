import { geminiModel } from '../lib/clients.mjs'

export async function generateAdvice({ 
  query, 
  history = [], 
  contextText, 
  systemPrompt, 
  providerName, 
  scanType 
}) {

  // --- HISTORY FORMATTING ---
  // 1. Slice: Last 7 messages
  // 2. Filter: Remove the active query to prevent duplication
  const relevantHistory = history
    .slice(-7) 
    .filter(msg => msg.content !== query) 
  
  const historyBlock = relevantHistory.length > 0 
    ? relevantHistory.map(msg => 
        `${msg.role === 'user' ? 'USER' : 'YOU'}: ${msg.content}`
      ).join("\n")
    : "No previous conversation."

  // --- 🕵️‍♂️ 2. DEBUG: MEMORY CHECK ---
  console.log(`\n🧠 CONTEXT MEMORY CHECK:`)
  console.log(`   - Raw History Count: ${history.length}`)
  console.log(`   - Filtered History Count: ${relevantHistory.length}`)
  if (relevantHistory.length > 0) {
      console.log(`   - 📜 INJECTING CONTEXT:\n"""\n${historyBlock}\n"""`)
  } else {
      console.log(`   - ⚪ No context injected (First message or history empty).`)
  }
  // ---------------------------------

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

      ### INTERNAL KNOWLEDGE LIBRARY
      ${contextText}

      ### CONVERSATION HISTORY (Context)
      ${historyBlock}

      ### CURRENT USER QUERY
      "${query}"
      
      ### INSTRUCTION
      Answer the current query. Refer to the CONVERSATION HISTORY if the user references previous topics.
    `
  } else {
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
  console.log(`🤖 CALLING GEMINI...`)
  
  const result = await geminiModel.generateContent({
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.1,      
      maxOutputTokens: 8192, 
    }
  })

  return result.response.text()
}