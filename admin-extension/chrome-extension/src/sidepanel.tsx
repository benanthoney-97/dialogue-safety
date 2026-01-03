import { useEffect, useState } from "react"
import "./style.css"
import { DecisionCard } from "./components/decision-card"
import type { DecisionCardProps } from "./components/decision-card"

type MatchPayload = {
  title?: string
  video_url?: string
  confidence?: string | number
  content?: string
  knowledge_id?: number
  page_match_id?: number
  phrase?: string
}

function SidePanel() {
  const [match, setMatch] = useState<MatchPayload | null>(null)

  useEffect(() => {
    console.log("[panel] mounted, requesting latest match")
    const listener = (message: any) => {
      console.log("[panel] received message", message)
      if (message.action === "matchData") {
        setMatch(message.match)
      }
    }

    chrome.runtime.onMessage.addListener(listener)

    chrome.runtime.sendMessage({ action: "getLatestMatch" }, (response) => {
      console.log("[panel] latest match response", response)
      if (response?.match) {
        setMatch(response.match)
      }
    })

    return () => {
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [])

  const cardProps: DecisionCardProps = {
    title: match?.title,
    videoUrl: match?.video_url,
    confidence: match?.confidence,
    content: match?.content,
    phrase: match?.phrase,
    knowledgeId: match?.knowledge_id ?? null,
    pageMatchId: match?.page_match_id ?? null,
  }

  return (
    <div className="flex h-screen w-full flex-col bg-transparent font-sans text-slate-900">
      <div className="flex-1 w-full flex flex-col items-stretch justify-start">
        <DecisionCard {...cardProps} />
      </div>
    </div>
  )
}

export default SidePanel
