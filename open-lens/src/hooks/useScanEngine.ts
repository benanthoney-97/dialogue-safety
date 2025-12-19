// src/hooks/useScanEngine.ts
import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
// Ensure this path matches where you put your source card type
import type { SourceDocument } from "../components/ui/sourceReferenceCard"

// Initialize Supabase Client
const supabase = createClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!
)

// Define Message Interface to include sources
interface Message {
  role: "user" | "assistant"
  content: string
  sources?: SourceDocument[] // 👈 Added sources to the type definition
}

export function useScanEngine() {
  // State
  const [currentView, setCurrentView] = useState<'dashboard' | 'chat'>('dashboard')
  const [providers, setProviders] = useState<any[]>([])
  const [activeProvider, setActiveProvider] = useState<any>(null)
  
  // Update State Type to use the new Message interface
  const [messages, setMessages] = useState<Message[]>([])
  
  const [isScanning, setIsScanning] = useState(false)
  const [pendingFallback, setPendingFallback] = useState<{text: string, type: string} | null>(null)

  // 1. Load Providers on Mount
  useEffect(() => {
    // MOCK USER: Change to test security
    const SIMULATED_USER_EMAIL = "steve@acme.com" 
    const userDomain = SIMULATED_USER_EMAIL.split('@')[1]

    const fetchProviders = async () => {
      // Fetch Public
      const { data: publicProviders } = await supabase
        .from('providers')
        .select('*')
        .eq('is_public', true)

      // Fetch Private Access
      const { data: accessList } = await supabase
        .from('provider_access')
        .select('provider_id')
        .eq('domain_pattern', userDomain)
      
      const allowedIds = accessList?.map(a => a.provider_id) || []
      
      let privateProviders: any[] = []
      if (allowedIds.length > 0) {
        const { data } = await supabase
            .from('providers')
            .select('*')
            .in('id', allowedIds)
        if(data) privateProviders = data
      }

      // Merge & De-duplicate
      const allProviders = [...(publicProviders || []), ...privateProviders]
      const unique = allProviders.filter((v,i,a)=>a.findIndex(v2=>(v2.id===v.id))===i)

      if (unique.length > 0) {
        setProviders(unique)
        setActiveProvider(unique[0]) 
      }
    }
    fetchProviders()
  }, [])

  // 2. Logic: Reset
  const handleReset = () => {
    setCurrentView('dashboard')
    setMessages([])
    setIsScanning(false)
    setPendingFallback(null)
  }


// 3. Logic: Analyze (The Core Loop)
  const runAnalysis = async (text: string, scanType: string, force = false) => {
    if (!activeProvider) return
    
    // Switch to Chat View
    setCurrentView('chat')

    // --- STATE UPDATE LOGIC ---
    if (force) {
        // 1. Force Retry: Just add "Thinking..." (Keep history)
        setMessages(prev => [...prev, { role: "assistant", content: "Generating general opinion..." }])
    
    } else if (scanType === 'full' || scanType === 'summary') {
        // 2. Full Page Scan: EXPLICITLY Reset History (Wipe history)
        setMessages([{ role: "assistant", content: `**${activeProvider.name}** is analyzing the page...` }])
    
    } else {
        // 3. Chat / Default: ALWAYS Append (Safe fallback)
        // This catches 'chat', 'selection', or any typos and preserves history
        setMessages(prev => [
            ...prev, 
            { role: "user", content: text }, 
            { role: "assistant", content: `**${activeProvider.name}** is thinking...` }
        ])
    }
    
    setIsScanning(true)
    setPendingFallback(null)

    try {
        const response = await fetch('http://localhost:3000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text, 
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

        setMessages(prev => {
            const history = prev.slice(0, -1) // Remove "Thinking..."
            return [...history, { 
                role: "assistant", 
                content: cleanAdvice,
                sources: result.sources // 👈 CRITICAL FIX: Save API sources to state
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

  // 4. Logic: Chrome Scripting
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
    // State
    currentView,
    activeProvider,
    providers,
    messages,
    isScanning,
    pendingFallback,
    // Setters
    setActiveProvider,
    // Actions
    handleReset,
    runAnalysis,
    performScan
  }
}