export {}

console.log("BACKGROUND: Service Worker Loaded!")

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log("BACKGROUND: Panel behavior set."))
  .catch((e) => console.error(e))

type MatchPayload = Record<string, unknown>
let latestMatch: MatchPayload | null = null
let lastMatchTabId: number | null = null

const PAGE_MATCH_API = "http://localhost:4173/api/page-match"
const PROVIDER_DOCUMENT_API = "http://localhost:4173/api/provider-document"
const PROVIDER_KNOWLEDGE_API = "http://localhost:4173/api/provider-knowledge"

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

const resolvePageMatchId = (match: MatchPayload) =>
  toNumber(
    match.page_match_id ??
      match.pageMatchId ??
      match.pageMatchID ??
      match.pageMatchid ??
      match.pageMatch ??
      match.id
  )

const toString = (value: unknown) => (typeof value === 'string' ? value : '')

const toVimeoPlayerUrl = (value: unknown) => {
  if (typeof value !== 'string') return value

  const matches = [
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/
  ]
  let videoId: string | null = null

  for (const pattern of matches) {
    const found = value.match(pattern)
    if (found) {
      videoId = found[1]
      break
    }
  }

  if (!videoId) return value

  const timestampMatch = value.match(/#t=(\d+)/)
  const suffix = timestampMatch ? `#t=${timestampMatch[1]}s` : ''
  return `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0${suffix}`
}

const fetchJson = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`)
  }
  return response.json()
}

const fetchPageMatch = async (pageMatchId: number | undefined | null) => {
  if (!pageMatchId) return null
  const url = `${PAGE_MATCH_API}?page_match_id=${encodeURIComponent(pageMatchId)}`
  try {
    console.log("[background] fetching page match", url)
    return await fetchJson(url)
  } catch (error) {
    console.error("[background] page match fetch error", error)
    return null
  }
}

const fetchProviderDocument = async (documentId: number | undefined | null, providerId: number | undefined | null) => {
  if (!documentId || !providerId) return null
  const url = `${PROVIDER_DOCUMENT_API}?document_id=${encodeURIComponent(documentId)}&provider_id=${encodeURIComponent(providerId)}`
  try {
    console.log("[background] fetching provider document", url)
    return await fetchJson(url)
  } catch (error) {
    console.error("[background] provider document fetch error", error)
    return null
  }
}

const fetchProviderKnowledge = async (knowledgeId: number | undefined | null) => {
  if (!knowledgeId) return null
  const url = `${PROVIDER_KNOWLEDGE_API}?knowledge_id=${encodeURIComponent(knowledgeId)}`
  try {
    console.log("[background] fetching provider knowledge", url)
    return await fetchJson(url)
  } catch (error) {
    console.error("[background] provider knowledge fetch error", error)
    return null
  }
}

const mergeDecisionPayload = (
  match: MatchPayload,
  pageMatch: Record<string, unknown> | null,
  doc: Record<string, unknown> | null,
  knowledge: Record<string, unknown> | null
) => {
  const merged = {
    ...match,
    ...(pageMatch || {})
  }

  if (doc) {
    const docTitle = toString(doc.title)
    const coverImage = toString(doc.cover_image_url)
    const sourceUrl = toString(doc.source_url)
    merged.document_title = docTitle || merged.document_title
    merged.title = docTitle || merged.title || ''
    merged.cover_image_url = coverImage || merged.cover_image_url || ''
    merged.is_active = typeof merged.is_active === 'undefined' ? doc.is_active : merged.is_active
    merged.source_url = sourceUrl || merged.source_url || ''
    merged.document_id = toNumber(doc.id) ?? merged.document_id
  }

  if (knowledge) {
    merged.content = toString(knowledge.content) || merged.content
    merged.knowledge_metadata = knowledge.metadata || merged.knowledge_metadata
  }

  return merged
}

const fetchDecisionData = async (match: MatchPayload) => {
  const pageMatchId = resolvePageMatchId(match)
  let pageMatch = await fetchPageMatch(pageMatchId)
  if (pageMatch && pageMatch.video_url) {
    pageMatch = {
      ...pageMatch,
      video_url: toVimeoPlayerUrl(pageMatch.video_url)
    }
  }
  const documentId = pageMatch?.document_id ?? match.document_id
  const providerId = toNumber(match.provider_id)
  const doc = await fetchProviderDocument(toNumber(documentId), providerId)
  const knowledgeId = toNumber(pageMatch?.knowledge_id ?? match.knowledge_id)
  const knowledge = await fetchProviderKnowledge(knowledgeId)
  return mergeDecisionPayload(match, pageMatch, doc, knowledge)
}

const notifyMatchData = (payload: MatchPayload) => {
  chrome.runtime.sendMessage({ action: "matchData", match: payload }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[background] notifyMatchData error", chrome.runtime.lastError.message)
    }
  })
}

const executePageHighlightRemoval = async (tabId: number, matchId: number) => {
  console.log("[background] executePageHighlightRemoval start", { tabId, matchId })
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (id: number) => {
        console.log("[background] invoke helper from page", id, (window as any).__SL_removeMatchHighlight)
        const remover = (window as any).__SL_removeMatchHighlight
        if (typeof remover === "function") {
          remover(id)
        }
      },
      args: [matchId]
    })
    console.log("[background] executePageHighlightRemoval success", { tabId, matchId })
  } catch (error) {
    console.error("[background] scripting removal error", error)
  }
}

const executePageHighlightAddition = async (tabId: number, match: MatchPayload) => {
  console.log("[background] executePageHighlightAddition start", { tabId, match })
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (matchData: MatchPayload) => {
        console.log("[background] invoke add helper from page", matchData?.page_match_id, matchData?.phrase, matchData)
        const adder = (window as any).__SL_addMatchHighlight
        if (typeof adder === "function") {
          adder(matchData)
        } else {
          console.warn("[background] add helper missing on page", matchData?.page_match_id)
        }
      },
      args: [match]
    })
    console.log("[background] executePageHighlightAddition success", { tabId, match })
  } catch (error) {
    console.error("[background] scripting addition error", error)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[background] received message", message)
  if (message.action === "matchClicked") {
    console.log("[background] matchClicked", message.match)
    lastMatchTabId = sender.tab?.id ?? lastMatchTabId
    const tabId = sender.tab?.id
    const windowId = sender.tab?.windowId
    const openOptions: chrome.sidePanel.OpenOptions = tabId
      ? { tabId }
      : windowId
      ? { windowId }
      : { windowId: chrome.windows.WINDOW_ID_CURRENT }
    chrome.sidePanel.open(openOptions, () => {})
    fetchDecisionData(message.match).then((data) => {
      latestMatch = data
      notifyMatchData(data)
    })
    return false
  }

  if (message.action === "removeMatchHighlight") {
    const matchId = toNumber(message.page_match_id ?? message.match?.page_match_id ?? message.match?.id)
    console.log("[background] removeMatchHighlight received", matchId, "lastTabId", lastMatchTabId)
    const targetTabId = lastMatchTabId ?? sender.tab?.id
    if (matchId && targetTabId) {
      executePageHighlightRemoval(targetTabId, matchId)
    } else if (matchId) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const fallback = tabs?.[0]
        const fallbackId = fallback?.id
        if (fallbackId) {
          lastMatchTabId = fallbackId
          executePageHighlightRemoval(fallbackId, matchId)
        }
      })
    }
    return false
  }

  if (message.action === "restoreMatchHighlight") {
    const matchData = message.match
    if (!matchData) {
      return false
    }
    console.log("[background] restoreMatchHighlight received", matchData)
    const targetTabId = lastMatchTabId ?? sender.tab?.id
    if (targetTabId) {
      executePageHighlightAddition(targetTabId, matchData)
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const fallback = tabs?.[0]
        const fallbackId = fallback?.id
        if (fallbackId) {
          lastMatchTabId = fallbackId
          executePageHighlightAddition(fallbackId, matchData)
        }
      })
    }
    return false
  }

  if (message.action === "getLatestMatch") {
    sendResponse({ match: latestMatch })
    return true
  }

  return false
})
