import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "http://localhost:4173/seedlegals_mirror*",
    "http://localhost:4173/pages/test-match-map*"
  ]
}

type MatchPayload = Record<string, unknown>

console.log("[content] script executing on", window.location.href)

const MATCH_MAP_SCRIPT_ID = "sl-match-map-data"
let cachedMatchMap: MatchPayload[] | null = null

const parseMatchMapFromScript = () => {
  const script = document.getElementById(MATCH_MAP_SCRIPT_ID)
  if (!script || !script.textContent) {
    return []
  }

  try {
    const parsed = JSON.parse(script.textContent)
    if (Array.isArray(parsed)) {
      cachedMatchMap = parsed
      return parsed
    }
  } catch (error) {
    console.error("[content] failed to parse match map", error)
  }

  return []
}

const getMatchMap = () => {
  if (cachedMatchMap) {
    return cachedMatchMap
  }

  const windowMatchMap = (window as any).__SL_MATCH_MAP__
  if (Array.isArray(windowMatchMap)) {
    cachedMatchMap = windowMatchMap
    return windowMatchMap
  }

  return parseMatchMapFromScript()
}

const sendMatchClick = (matchIndex: number) => {
  console.log("[content] preparing match click", matchIndex)
  const match = getMatchMap()[matchIndex]
  if (!match) {
    console.warn("[content] no match found at index", matchIndex)
    return
  }

  const targetIsVisitor = document.documentElement?.classList.contains("sl-visitor-mode") ||
    document.body?.classList.contains("sl-visitor-mode")
  if (targetIsVisitor) {
    console.log("[content] page is in visitor mode, not sending matchClicked")
    return
  }

  const payload: MatchPayload = {
    ...match,
    page_match_id: match.page_match_id ?? match.id ?? null
  }
  console.log("[content] dispatching match click payload", payload)
  console.log("[content] sending matchClicked to extension", match)
  chrome.runtime.sendMessage({ action: "matchClicked", match }, (response) => {
    const err = chrome.runtime.lastError
    if (err) {
      console.error("[content] sendMessage error", err)
    } else {
      console.log("[content] message acknowledged", response)
    }
  })
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest(".sl-smart-link")
  if (!target) return
  event.preventDefault()
  console.log("[content] clicked smart-link", {
    text: target.textContent,
    idx: target.getAttribute("data-match-index"),
    pageMatchId: target.getAttribute("data-page-match-id"),
    classList: Array.from(target.classList)
  })
  const index = Number(target.getAttribute("data-match-index"))
  if (!Number.isNaN(index)) {
    console.log("[content] matched index", index)
    sendMatchClick(index)
  }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "removeMatchHighlight") {
    const id = request.page_match_id ?? request.match?.page_match_id ?? request.match?.id
    console.log("[content] removeMatchHighlight received", id)
    invokePageScriptRemoval(id)
    return false
  }

  if (request.action === "read_page") {
    const content = document.body.innerText || ""
    
    // 1. Send response immediately
    sendResponse({
      title: document.title,
      url: window.location.href,
      content: content.replace(/\s+/g, " ").trim()
    })
    
    // 2. Do NOT return true here, because we just finished responding.
    return false 
  }
  
  // 3. If it's a message we don't recognize, return false to close the channel immediately.
  return false 
})

const invokePageScriptRemoval = (matchId: number | string | undefined | null) => {
  if (!matchId) return
  const removeFn = (window as any).__SL_removeMatchHighlight
  if (typeof removeFn === "function") {
    removeFn(matchId)
  }
}
