import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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