import React, { useEffect, useRef } from "react"
import "./decision-card.js"

export interface DecisionCardProps {
  title?: string
  confidence?: string | number
  content?: string
  phrase?: string
  videoUrl?: string
  knowledgeId?: number | null
  pageMatchId?: number | null
}

export function DecisionCard({
  title,
  confidence,
  content,
  phrase,
  videoUrl,
  knowledgeId,
  pageMatchId,
}: DecisionCardProps) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (title !== undefined) element.setAttribute("data-title", title)
    if (confidence !== undefined) element.setAttribute("data-confidence", String(confidence))
    if (phrase !== undefined) element.setAttribute("data-phrase", phrase)
    if (content !== undefined) element.setAttribute("data-content", content)
    if (videoUrl !== undefined) element.setAttribute("data-video", videoUrl)
    if (knowledgeId !== undefined && knowledgeId !== null) {
      element.setAttribute("data-knowledge-id", String(knowledgeId))
    }
    if (pageMatchId !== undefined && pageMatchId !== null) {
      element.setAttribute("data-page-match-id", String(pageMatchId))
    }
  }, [title, confidence, content, phrase, videoUrl, knowledgeId, pageMatchId])

  return <decision-card ref={ref} />
}
