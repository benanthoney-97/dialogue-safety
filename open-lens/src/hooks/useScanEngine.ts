import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import type { SourceDocument } from "../components/ui/sourceReferenceCard"

// Initialize Supabase Client
const supabase = createClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!
)

interface Message {
  role: "user" | "assistant"
  content: string
  sources?: SourceDocument[] 
}

export function useScanEngine() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'chat'>('dashboard')
  const [providers, setProviders] = useState<any[]>([])
  const [activeProvider, setActiveProvider] = useState<any>(null)
  
  const [messages, setMessages] = useState<Message[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [pendingFallback, setPendingFallback] = useState<{text: string, type: string} | null>(null)

  // 1. Load Providers
  useEffect(() => {
    const SIMULATED_USER_EMAIL = "steve@acme.com" 
    const userDomain = SIMULATED_USER_EMAIL.split('@')[1]

    const fetchProviders = async () => {
      const { data: publicProviders } = await supabase.from('providers').select('*').eq('is_public', true)
      
      const { data: accessList } = await supabase.from('provider_access').select('provider_id').eq('domain_pattern', userDomain)
      const allowedIds = accessList?.map(a => a.provider_id) || []
      
      let privateProviders: any[] = []
      if (allowedIds.length > 0) {
        const { data } = await supabase.from('providers').select('*').in('id', allowedIds)
        if(data) privateProviders = data
      }

      const allProviders = [...(publicProviders || []), ...privateProviders]
      const unique = allProviders.filter((v,i,a)=>a.findIndex(v2=>(v2.id===v.id))===i)

      if (unique.length > 0) {
        setProviders(unique)
        setActiveProvider(unique[0]) 
      }
    }
    fetchProviders()
  }, [])

  // 2. Reset Logic
  const handleReset = () => {
    setCurrentView('dashboard')
    setMessages([])
    setIsScanning(false)
    setPendingFallback(null)
  }

  // 3. Analyze Logic (The Fix)
  const runAnalysis = async (text: string, scanType: string, force = false) => {
    if (!activeProvider) return
    
    setCurrentView('chat')
    setIsScanning(true)
    setPendingFallback(null)

    // --- 🅰️ CALCULATE HISTORY PAYLOAD ---
    let historyPayload: Message[] = []

    // Rule: If it's a NEW scan (selection/page) or a Force Retry, we RESET history.
    // We only keep history if it is a 'chat' follow-up.
    if (scanType === 'chat' && !force) {
       historyPayload = [...messages, { role: "user", content: text }]
    } else {
       // Start Fresh for new audits
       historyPayload = [] 
    }

    // --- 🅱️ UPDATE UI (Optimistic) ---
    if (scanType === 'chat' && !force) {
        setMessages(prev => [...prev, { role: "user", content: text }, { role: "assistant", content: `**${activeProvider.name}** is thinking...` }])
    } else {
        setMessages([{ role: "assistant", content: `**${activeProvider.name}** is analysing...` }])
    }

    // --- 🕵️‍♂️ DEBUG LOG (Check your browser console!) ---
    console.log("🚀 SENDING TO API:", {
        text,
        scanType,
        historyLength: historyPayload.length,
        historyContent: historyPayload
    })

    try {
        const response = await fetch('http://localhost:3000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text, 
                messages: historyPayload, // 👈 KEY: Sending the calculated variable, NOT the state
                scanType,
                providerId: activeProvider.id,
                forceFallback: force 
            })
        })
        const result = await response.json()

        if (result.requiresConfirmation === true) {
            setMessages(prev => prev.slice(0, -1)) 
            setPendingFallback({ text, type: scanType }) 
            setIsScanning(false)
            return 
        }

        const cleanAdvice = result.advice
            ? result.advice.replace(/^```markdown\s*/i, "").replace(/```$/, "").trim()
            : "No output generated."

        // Update UI with real answer
        setMessages(prev => {
            // If we started fresh, 'prev' is just the "Thinking..." message. 
            // If we chatted, 'prev' is History + User + "Thinking..."
            const base = prev.slice(0, -1) 
            return [...base, { 
                role: "assistant", 
                content: cleanAdvice,
                sources: result.sources 
            }] 
        })

    } catch (e) {
        console.error(e)
        setMessages(prev => {
             const history = prev.slice(0, -1)
             return [...history, { role: "assistant", content: "Error: Could not connect to Platform Brain." }]
        })
    } finally {
        setIsScanning(false)
    }
  }

  // 4. Chrome Scripting
  const performScan = async (type: 'full' | 'selection' | 'summary') => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    let scriptFunc = () => window.getSelection()?.toString()
    if (type === 'full' || type === 'summary') {
        scriptFunc = () => document.body.innerText.replace(/\s+/g, " ").slice(0, 15000)
    }

    const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, 
        func: scriptFunc
    })
    
    const text = res[0]?.result
    if (text && text.trim().length > 0) {
        runAnalysis(text, type)
    } else {
        setCurrentView('chat')
        setMessages([{ role: "assistant", content: "No text found to analyze." }])
    }
  }

  return {
    currentView, activeProvider, providers, messages, isScanning, pendingFallback,
    setActiveProvider, handleReset, runAnalysis, performScan
  }
}