export {}

console.log("BACKGROUND: Service Worker Loaded!")

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => console.log("BACKGROUND: Panel behavior set."))
  .catch((e) => console.error(e))