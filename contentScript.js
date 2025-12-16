const LOG_FLAG = 'dialogueSafetyHelperLogged';
const LOG_TEXT_ATTR = 'dialogueSafetyHelperText';
const KEYWORDS = ['hate', 'unsafe'];
const KEYWORD_PATTERN = `\\b(${KEYWORDS.join('|')})\\b`;
const SELECTOR = 'p, li, span, h1, h2, h3, strong, em';
const OBSERVER_CONFIG = { childList: true, subtree: true, characterData: true };
const LOG_STORAGE_KEY = 'dialogueSafetyKeywordLog';
const LOG_MAX_ENTRIES = 40;
const PROVIDER_SITES = [
  { match: 'gemini.google.com', label: 'Google Gemini' },
  { match: 'chatgpt.com', label: 'ChatGPT' },
  { match: 'chat.openai.com', label: 'ChatGPT' },
];
const ASSISTANT_SELECTOR = [
  '[data-role="assistant"]',
  '[data-testid="assistant-response"]',
  '.assistant-message',
  '.assistant-response',
  '.agent-response',
  '.model-response-text',
  '.structured-content-container',
  '.model-response-text.ng-star-inserted',
  '.structured-content-container.ng-star-inserted',
  '.assistant-bubble',
].join(',');
const SEND_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button[aria-label="Send"]',
  'button[data-testid="prompt-send"]',
  'button[data-testid="send-button"]',
];
const COMPOSER_SELECTORS = [
  '#prompt-textarea',
  'textarea',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
];
const IS_CHATGPT = location.hostname.includes('chatgpt.com') || location.hostname.includes('chat.openai.com');
const ACTIVITY_STORAGE_KEY = 'dialogueSafetyLastActivity';
const ACTIVITY_EVENTS = ['keydown', 'mousedown', 'touchstart'];
const ACTIVITY_THROTTLE_MS = 5000;
const AI_DECISION_KEY = 'dialogueSafetyLastAIDecision';
const AI_CHECK_DEBOUNCE_MS = 2000;
let lastActivityTimestamp = 0;
let activityDebounce;

let autoHighlightEnabled = true;
let observer;
let lastLoggedEntry = null;
let languageModelEnsured = false;
let aiCheckTimeout = null;
let pendingAICheck = null;
let lastAICheckSentence = '';
let nanoTriggersSetup = false;
let assistantObserver = null;
const assistantNodeTimers = new WeakMap();
const assistantLastTexts = new WeakMap();
const assistantProcessedText = new WeakMap();
const ASSISTANT_DEBOUNCE_MS = 2000;
let hasUserInteracted = false;

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function getProviderLabel() {
  const hostname = location.hostname;
  for (const provider of PROVIDER_SITES) {
    if (hostname.includes(provider.match)) {
      return provider.label;
    }
  }
  return hostname;
}

function isTrackedProvider() {
  const hostname = location.hostname;
  return PROVIDER_SITES.some((provider) => hostname.includes(provider.match));
}

function buildEntryMeta(base) {
  const now = new Date();
  const platform = base.platform ?? getProviderLabel();
  return {
    ...base,
    date: formatDate(now),
    time: formatTime(now),
    platform,
  };
}

function notifyBackground(entry) {
  if (!chrome?.runtime?.sendMessage) {
    return;
  }
  safeSendMessage({ type: 'log-entry', entry }, () => {
    if (chrome.runtime.lastError) {
      console.debug('[Dialogue Safety] log notification failed', chrome.runtime.lastError);
    }
  });
}

function storageAvailable() {
  return Boolean(chrome?.storage?.local && chrome?.runtime?.id);
}

function safeStorageGet(keys, callback) {
  if (!storageAvailable()) {
    return;
  }
  try {
    chrome.storage.local.get(keys, callback);
  } catch (error) {
    console.debug('[Dialogue Safety] storage.get failed', error);
  }
}

function safeSendMessage(payload, callback) {
  if (!chrome?.runtime?.sendMessage) {
    if (typeof callback === 'function') {
      callback();
    }
    return;
  }
  try {
    chrome.runtime.sendMessage(payload, callback);
  } catch (error) {
    console.debug('[Dialogue Safety] sendMessage failed', error);
    if (typeof callback === 'function') {
      callback();
    }
  }
}

function safeStorageSet(payload, callback) {
  if (!storageAvailable()) {
    return;
  }
  try {
    chrome.storage.local.set(payload, callback);
  } catch (error) {
    console.debug('[Dialogue Safety] storage.set failed', error);
  }
}

function pushLogEntry(entry) {
  const entryWithMeta = buildEntryMeta(entry);
  if (isDuplicate(entryWithMeta, lastLoggedEntry)) {
    return;
  }
  safeStorageGet([LOG_STORAGE_KEY], (snapshot) => {
    if (chrome.runtime.lastError) {
      console.debug('[Dialogue Safety] storage read failed', chrome.runtime.lastError);
      return;
    }
    const current = Array.isArray(snapshot[LOG_STORAGE_KEY]) ? snapshot[LOG_STORAGE_KEY] : [];
    const next = [entryWithMeta, ...current];
    if (next.length > LOG_MAX_ENTRIES) {
      next.splice(LOG_MAX_ENTRIES);
    }
    safeStorageSet({ [LOG_STORAGE_KEY]: next }, () => {
      if (chrome.runtime.lastError) {
        console.debug('[Dialogue Safety] storage write failed', chrome.runtime.lastError);
        return;
      }
      notifyBackground(entryWithMeta);
      lastLoggedEntry = entryWithMeta;
    });
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSentence(text = '', keywords = []) {
  if (!text || !text.trim()) {
    return '';
  }
  if (!keywords.length) {
    return text.trim();
  }
  const pattern = keywords.map((keyword) => escapeRegex(keyword)).join('|');
  const sentenceRegex = new RegExp(`(?:^|[.!?]\\s*)[^.!?]*\\b(?:${pattern})\\b[^.!?]*(?:[.!?]|$)`, 'i');
  const match = sentenceRegex.exec(text);
  return (match?.[0] ?? text).trim();
}

function normalizeKeywords(keys) {
  return [...keys].map((kw) => kw.toLowerCase()).sort().join('|');
}

function isDuplicate(next, prev) {
  if (!prev) {
    return false;
  }
  if (next.type !== prev.type) {
    return false;
  }
  if (next.platform !== prev.platform) {
    return false;
  }
  if (next.type === 'keyword') {
    return normalizeKeywords(next.keywords) === normalizeKeywords(prev.keywords)
      && (next.toxicity?.label ?? '') === (prev.toxicity?.label ?? '');
  }
  return next.text === prev.text;
}

function logKeywords(keywords, text = '') {
  if (!keywords.length) {
    return;
  }
  const sentence = extractSentence(text, keywords);
  pushLogEntry({
    type: 'keyword',
    keywords,
    sentence,
  });
}

function scheduleAICheck(sentence, keywords) {
  const payload = { sentence, keywords };
  pendingAICheck = payload;
  if (aiCheckTimeout) {
    clearTimeout(aiCheckTimeout);
  }
  aiCheckTimeout = setTimeout(() => {
    aiCheckTimeout = null;
    if (!pendingAICheck) {
      return;
    }
    if (pendingAICheck.sentence === lastAICheckSentence) {
      pendingAICheck = null;
      return;
    }
    lastAICheckSentence = pendingAICheck.sentence;
    const { sentence: queuedSentence, keywords: queuedKeywords } = pendingAICheck;
    pendingAICheck = null;
    checkWithAI(queuedSentence, queuedKeywords);
  }, AI_CHECK_DEBOUNCE_MS);
}

function runImmediateAICheck(sentence, keywords = []) {
  if (!sentence) {
    return;
  }
  if (sentence === lastAICheckSentence) {
    return;
  }
  lastAICheckSentence = sentence;
  if (aiCheckTimeout) {
    clearTimeout(aiCheckTimeout);
    aiCheckTimeout = null;
  }
  pendingAICheck = null;
  checkWithAI(sentence, keywords);
}

function markUserInteracted() {
  if (!hasUserInteracted) {
    hasUserInteracted = true;
    captureExistingAssistantState();
  }
}

function getComposerElement() {
  for (const selector of COMPOSER_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }
  return null;
}

function getComposerText() {
  const composer = getComposerElement();
  if (!composer) {
    return '';
  }
  if ('value' in composer && typeof composer.value === 'string') {
    return composer.value.trim();
  }
  return composer.textContent?.trim() ?? '';
}

function isComposerTarget(target) {
  if (!target || !(target instanceof Element)) {
    return false;
  }
  if (target.closest(COMPOSER_SELECTORS.join(','))) {
    return true;
  }
  return target.isContentEditable;
}

function setupDraftWatcher() {
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!isComposerTarget(target)) {
      return;
    }
    markUserInteracted();
    const text = getComposerText();
    scheduleAICheck(text, []);
  }, { capture: true });
}

function setupSendWatcher() {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.key === 'Enter' && !event.shiftKey && isComposerTarget(target)) {
      markUserInteracted();
      runImmediateAICheck(getComposerText(), []);
    }
  }, { capture: true });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest(SEND_BUTTON_SELECTORS.join(','));
    if (button) {
      markUserInteracted();
      runImmediateAICheck(getComposerText(), []);
    }
  });
}

function getTopLevelAssistant(element) {
  if (!(element instanceof Element)) {
    return null;
  }
  let candidate = element.matches(ASSISTANT_SELECTOR) ? element : element.closest(ASSISTANT_SELECTOR);
  if (!candidate) {
    return null;
  }
  let ancestor = candidate.parentElement;
  while (ancestor) {
    if (ancestor.matches?.(ASSISTANT_SELECTOR)) {
      candidate = ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return candidate;
}

function scanAssistantNodes(node) {
  if (!(node instanceof Element)) {
    return;
  }
  const targets = new Set();
  const root = getTopLevelAssistant(node);
  if (root) {
    targets.add(root);
  }
  node.querySelectorAll(ASSISTANT_SELECTOR).forEach((candidate) => {
    const assistantRoot = getTopLevelAssistant(candidate);
    if (assistantRoot) {
      targets.add(assistantRoot);
    }
  });
  targets.forEach(scheduleAssistantCheck);
}

function scheduleAssistantCheck(node) {
  if (!(node instanceof Element)) {
    return;
  }
  if (!hasUserInteracted) {
    return;
  }
  const record = assistantNodeTimers.get(node);
  if (record?.timer) {
    clearTimeout(record.timer);
  }
  const timer = setTimeout(() => {
    assistantNodeTimers.delete(node);
    const finalText = node.textContent?.trim() ?? '';
    if (!finalText) {
      return;
    }
    if (assistantLastTexts.get(node) === finalText) {
      return;
    }
    assistantLastTexts.set(node, finalText);
    if (assistantProcessedText.get(node) === finalText) {
      return;
    }
    assistantProcessedText.set(node, finalText);
    runImmediateAICheck(finalText, []);
  }, ASSISTANT_DEBOUNCE_MS);
  assistantNodeTimers.set(node, { timer });
}

function captureExistingAssistantState() {
  document.querySelectorAll(ASSISTANT_SELECTOR).forEach((node) => {
    const assistantRoot = getTopLevelAssistant(node);
    if (!(assistantRoot instanceof Element)) {
      return;
    }
    if (assistantLastTexts.has(assistantRoot)) {
      return;
    }
    const text = assistantRoot.textContent?.trim() ?? '';
    if (text) {
      assistantLastTexts.set(assistantRoot, text);
      assistantProcessedText.set(assistantRoot, text);
    }
  });
}

function setupAIReplyWatcher() {
  if (assistantObserver) {
    return;
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => scanAssistantNodes(node));
      } else if (mutation.type === 'characterData') {
        scanAssistantNodes(mutation.target?.parentElement);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  assistantObserver = observer;
}

function setupNanoTriggers() {
  if (nanoTriggersSetup) {
    return;
  }
  nanoTriggersSetup = true;
  setupDraftWatcher();
  setupSendWatcher();
  setupAIReplyWatcher();
}


function logSystem(message) {
  pushLogEntry({
    type: 'system',
    text: message,
  });
}

function notifyActivity(timestamp, platform) {
  if (!chrome?.runtime?.sendMessage) {
    return;
  }
  chrome.runtime.sendMessage({ type: 'activity', entry: { timestamp, platform } }, () => {
    if (chrome.runtime.lastError) {
      console.debug('[Dialogue Safety] activity notification failed', chrome.runtime.lastError);
    }
  });
}

function persistActivity(timestamp, platform) {
  const payload = { timestamp, platform };
  safeStorageSet({ [ACTIVITY_STORAGE_KEY]: payload }, () => {
    notifyActivity(timestamp, platform);
  });
}

function requestLanguageModel(userActivated) {
  if (languageModelEnsured || !chrome?.runtime?.sendMessage) {
    return;
  }
  console.info('[Dialogue Safety] userActivation.isActive', userActivated);
  safeSendMessage({ action: 'ensure_language_model', userActivated }, (response) => {
    if (response?.status === 'ready') {
      languageModelEnsured = true;
    }
  });
}

function checkWithAI(sentence, keywords) {
  if (!sentence) {
    return;
  }
  const payload = {
    action: 'check_with_ai',
    sentence,
    keywords,
    userActivated: navigator.userActivation?.isActive ?? true,
  };
  safeSendMessage(payload, (response) => {
    if (chrome.runtime.lastError) {
      console.debug('[Dialogue Safety] AI check failed', chrome.runtime.lastError);
      return;
    }
    console.info('[Dialogue Safety][Nano] AI check result', response);
    handleAIDecision(response);
  });
}

function handleAIDecision(response) {
  if (!response || response.status !== 'ok') {
    return;
  }
  const decision = {
    safe: Boolean(response.safe),
    reason: response.reason ?? '',
    confidence: typeof response.confidence === 'number' ? response.confidence : 0,
    sentence: response.sentence ?? '',
    timestamp: Date.now(),
  };
  safeStorageSet({ [AI_DECISION_KEY]: decision }, () => {});
  document.body.dataset.dialogueSafetyAlert = decision.safe ? 'safe' : 'unsafe';
}

function recordActivity() {
  if (!isTrackedProvider()) {
    return;
  }
  markUserInteracted();
  const now = Date.now();
  if (now - lastActivityTimestamp < ACTIVITY_THROTTLE_MS) {
    return;
  }
  lastActivityTimestamp = now;
  const platform = getProviderLabel();
  persistActivity(now, platform);
  const userActivated = navigator.userActivation?.isActive ?? true;
  requestLanguageModel(userActivated);
}

function hasWordChar(char) {
  return /[A-Za-z0-9_]/.test(char);
}

function findKeywords(text) {
  if (!text) {
    return [];
  }
  const regex = new RegExp(KEYWORD_PATTERN, 'gi');
  const seen = new Set();
  const matches = [];
  let match;

  while ((match = regex.exec(text))) {
    const normalized = match[1].toLowerCase();
    const start = match.index;
    const end = start + match[1].length;
    const prevChar = text[start - 1];
    const nextChar = text[end];

    if (hasWordChar(prevChar) || hasWordChar(nextChar)) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    matches.push(match[1]);
  }

  return matches;
}

function markElement(el) {
  const currentText = el.textContent ?? '';
  const previousText = el.dataset[LOG_TEXT_ATTR] ?? '';
  if (currentText === previousText && el.dataset[LOG_FLAG]) {
    return false;
  }
  const keywords = findKeywords(el.textContent);
  if (!keywords.length) {
    el.dataset[LOG_TEXT_ATTR] = currentText;
    delete el.dataset[LOG_FLAG];
    return false;
  }
  el.dataset[LOG_TEXT_ATTR] = currentText;
  el.dataset[LOG_FLAG] = '1';
  logKeywords(keywords, currentText);
  return true;
}

function highlight(root = document) {
  let marked = 0;

  if (root !== document && root.nodeType === Node.ELEMENT_NODE && root.matches?.(SELECTOR)) {
    if (markElement(root)) {
      marked += 1;
    }
  }

  const descendants = root === document ? document.querySelectorAll(SELECTOR) : root.querySelectorAll(SELECTOR);
  descendants.forEach((el) => {
    if (markElement(el)) {
      marked += 1;
    }
  });

  return marked;
}

function clearDedupState() {
  lastLoggedEntry = null;
}

function resetHighlights() {
  autoHighlightEnabled = false;
  document.querySelectorAll(SELECTOR).forEach((el) => {
    delete el.dataset[LOG_FLAG];
  });
  logSystem('Highlight tracking cleared.');
  clearDedupState();
}

function observeMutations() {
  if (observer) {
    return;
  }

  const callback = (mutations) => {
    if (!autoHighlightEnabled) {
      return;
    }
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            highlight(node);
          }
        });
      } else if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent) {
          highlight(parent);
        }
      }
    });
  };

  observer = new MutationObserver(callback);

  const attach = () => {
    if (observer && document.body) {
      observer.observe(document.body, OBSERVER_CONFIG);
    }
  };

  if (document.body) {
    attach();
  } else {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  }
}

function setupActivityTracking() {
  if (!isTrackedProvider()) {
    return;
  }
  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, recordActivity, { capture: true, passive: true });
  });
}

observeMutations();
highlight();
setupActivityTracking();
setupNanoTriggers();
document.addEventListener('DOMContentLoaded', setupNanoTriggers, { once: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    clearDedupState();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'highlight') {
    autoHighlightEnabled = true;
    const highlighted = highlight();
    logSystem('Manual scan triggered.');
    sendResponse({ status: `Highlighted ${highlighted} element${highlighted === 1 ? '' : 's'}.` });
  } else if (message?.action === 'reset') {
    resetHighlights();
    sendResponse({ status: 'Hints reset.' });
  }
});
