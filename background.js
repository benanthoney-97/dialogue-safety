const OFFSCREEN_URL = 'offscreen.html';
let creatingOffscreen;
let userActivationGranted = false;

function logModel(message, detail) {
  console.info('[Dialogue Safety][Nano]', message, detail ?? '');
}

async function ensureOffscreen() {
  if (!chrome?.offscreen) {
    throw new Error('offscreen is not available in this browser');
  }
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Run Gemini Nano for safety analysis',
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  } else {
    await creatingOffscreen;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

function sendToOffscreen(payload) {
  return ensureOffscreen().then(() => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  }));
}

function logEntry(entry) {
  const details = entry.type === 'keyword'
    ? entry.keywords?.join(', ') ?? 'keyword match'
    : entry.text;
  const timestamp = entry.date ? `${entry.date} ${entry.time}` : entry.time;
  const suffix = entry.platform ? `(platform: ${entry.platform})` : '';
  console.info(`[Dialogue Safety] ${timestamp} ${entry.type} ${details} ${suffix}`);
}

function logActivity(entry) {
  const when = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'unknown';
  console.info(`[Dialogue Safety] last activity ${entry.platform || 'unknown'} at ${when}`);
}

chrome.runtime.onInstalled.addListener(() => {
  console.info('[Dialogue Safety] background service worker installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.info('[Dialogue Safety] background service worker started');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }

  if (message.type === 'log-entry') {
    logEntry(message.entry);
    return;
  }

  if (message.type === 'activity') {
    logActivity(message.entry);
    return;
  }

  if (message?.action === 'language_model_status') {
    sendToOffscreen({ action: 'offscreen_language_model_status' })
      .then((status) => sendResponse(status))
      .catch((error) => {
        console.warn('[Dialogue Safety][Nano] status error', error);
        sendResponse({ availability: 'unknown', ready: false, error: error?.message ?? 'failed' });
      });
    return true;
  }

  if (message?.action === 'check_with_ai') {
    logModel('ai check', { sentence: message.sentence, keywords: message.keywords });
    userActivationGranted = userActivationGranted || Boolean(message.userActivated);
    if (!userActivationGranted) {
      sendResponse({ status: 'waiting_for_user_activation' });
      return;
    }
    sendToOffscreen({
      action: 'offscreen_prompt',
      sentence: message.sentence,
      keywords: message.keywords,
    })
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        logModel('offscreen prompt error', error?.message ?? error);
        sendResponse({ status: 'error', error: error?.message ?? 'offscreen unavailable' });
      });
    return true;
  }

  if (message?.action === 'ensure_language_model') {
    logModel('ensure request', { userActivated: Boolean(message.userActivated) });
    userActivationGranted = userActivationGranted || Boolean(message.userActivated);
    if (!userActivationGranted) {
      sendResponse({ status: 'waiting_for_user_activation' });
      return;
    }
    sendToOffscreen({ action: 'offscreen_ensure_language_model', userActivated: Boolean(message.userActivated) })
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        logModel('offscreen error', error?.message ?? error);
        sendResponse({ status: 'error', availability: 'unknown', error: error?.message ?? 'offscreen unavailable' });
      });
    return true;
  }
});
