# Dialogue Safety Chrome Extension

This directory contains a Chrome extension that watches Gemini and ChatGPT conversations for conversational cues such as "risk", "urgent", or "warning". Matches are recorded into the extension's storage, but the page itself is left untouched so the end user does not see any overt highlighting.

## Files
- `manifest.json`: Declares the extension metadata, permissions, action popup, and content script injection.
- `popup.html`, `popup.css`, `popup.js`: Provide the toolbar UI for triggering scans, clearing state, and opening the parent view page.
- `contentScript.js`: Observes the page for the configured keywords, deduplicates matches, and stores log entries plus activity timestamps; classification is disabled for now so only keyword metadata is recorded. Each detection now includes the sentence that matched, which the parent view surfaces for context.
- `background.js`: Logs every keyword entry and activity report while coordinating the offscreen Gemini Nano document that downloads the Prompt API session when a user interacts.
- `offscreen.html`/`offscreen.js`: Hosts the DOM context that calls `LanguageModel.params()`, `availability()`, and `create()` after the background worker relays the user-activation request, so the prompt model can download safely.
- The AI check flow now (`check_with_ai` → `offscreen_prompt`) routes each captured sentence through Gemini Nano, requesting English input/output and enforcing a JSON Schema that returns `{ safe, reason, confidence }`. The content script triggers that flow after a brief typing pause, when a message is sent, and when the AI replies, stores the resulting verdict, and updates the parent view’s “Latest AI verdict” block so you can see when Nano marks a sentence as at risk.
- `parent.html`, `parent.css`, `parent.js`: Stand-alone parent view page that reads stored entries, renders the sidebar/guardrail panels, and surfaces the latest activity and log information.

## Running locally
1. Open `chrome://extensions` in Chrome and enable _Developer mode_.
2. Click _Load unpacked_ and choose this directory.
3. Use the toolbar button to scan the active tab; the content script keeps watching for updates in the background.
4. Click _Open parent view_ (or visit `chrome-extension://<extension-id>/parent.html`) to review the logged keywords, activity, and sidebar views.
5. Refresh Gemini/ChatGPT tabs after loading the extension to ensure the content script injects the latest listener bundle.

## Notes
- The popup communicates with the content script via `chrome.tabs.sendMessage`, so the extension must be allowed on the current page (e.g., it cannot run on the Chrome Web Store).
- Stored entries include platform metadata and timestamps so the parent view can show precise origin details while keeping the UI discreet.
- The keyword list lives directly in `contentScript.js`; update it if you need to watch for different cues.
- The parent view automatically reflects storage updates when new keywords arrive or when highlights are reset, and the status/guardrail views show the latest state derived from that log.
- The background worker keeps an eye on the Gemini Nano availability logs; watch the service worker console to see download progress and readiness, and note that the session only starts after the user interacts with Gemini/ChatGPT (the content script now repeatedly requests the model once it detects activation).
- To test Chromium’s Prompt API on localhost, enable the flags `#optimization-guide-on-device-model` and `#prompt-api-for-gemini-nano-multimodal-input`, relaunch Chrome, and the built-in APIs will work inside the extension.
- Activity tracking currently focuses on the supported provider URLs, letting the parent view surface when a tracked site was last used.
