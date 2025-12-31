import { useState, useEffect, useCallback } from "react"

export function useGeminiNano() {
  const [session, setSession] = useState<any>(null)
  const [status, setStatus] = useState<"loading" | "downloading" | "ready" | "error">("loading")
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [protocol, setProtocol] = useState<any>(null)

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    try {
      // 1. Load Protocol
      const storage = await chrome.storage.local.get(["advisorProtocol"])
      setProtocol(storage.advisorProtocol || null)

      console.log("AI: Checking LanguageModel availability...")

      // 2. CHECK GLOBAL API (New 2025 Standard)
      // We look for 'LanguageModel' directly on the global scope (self)
      const ModelClass = (self as any).LanguageModel
      
      if (!ModelClass) {
        throw new Error("LanguageModel API not found. Chrome may need an update or flags.")
      }

      // 3. Check Availability (As per your docs)
      const availabilityInfo = await ModelClass.availability()
      console.log("AI Status:", availabilityInfo.available)

      if (availabilityInfo.available === "no") {
        throw new Error("AI is not supported on this device.")
      }

      // 4. Create Session with Monitor (Exact syntax from your snippet)
      // This handles both 'readily' and 'after-download' states automatically.
      console.log("AI: Creating session...")
      
      const newSession = await ModelClass.create({
        initialPrompts: [
          { role: "system", content: "You are a helpful assistant." }
        ],
        monitor(m: any) {
          m.addEventListener('downloadprogress', (e: any) => {
            const pct = Math.round((e.loaded / e.total) * 100)
            console.log(`Downloaded ${pct}%`)
            setStatus("downloading")
            setDownloadProgress(pct)
          })
        }
      })

      console.log("AI: Session Ready!")
      setSession(newSession)
      setStatus("ready")

    } catch (err: any) {
      console.error("AI Init Error:", err)
      setStatus("error")
    }
  }

  const generate = useCallback(async (prompt: string, onChunk: (text: string) => void) => {
    if (!session) {
      onChunk("Error: AI session is not ready.")
      return
    }

    try {
      const stream = session.promptStreaming(prompt)
      for await (const chunk of stream) {
        onChunk(chunk)
      }
    } catch (e: any) {
      console.error("Generation Error:", e)
      onChunk(`Error: ${e.message}`)
    }
  }, [session])

  return { status, downloadProgress, protocol, generate }
}