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
const ACTIVITY_THROTTLE_MS = 60000;
const AI_DECISION_KEY = 'dialogueSafetyLastAIDecision';
const AI_CHECK_DEBOUNCE_MS = 4000;
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
let hasUserInteracted = false;
const ASSISTANT_ID_KEYS = ['message_id', 'messageId', 'response_id', 'responseId', 'id'];
const MAX_ASSISTANT_IDS = 200;
const assistantProcessedIds = new Set();
const assistantIdQueue = [];
const MAX_ASSISTANT_PAYLOADS = 200;
const assistantPayloadHistory = new Set();
const assistantPayloadQueue = [];

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
      if (entryWithMeta.type !== 'keyword') {
        notifyBackground(entryWithMeta);
      }
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

function scheduleAICheck(sentence, keywords, source = 'draft') {
  const payload = { sentence, keywords, source };
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
    const { sentence: queuedSentence, keywords: queuedKeywords, source: queuedSource } = pendingAICheck;
    pendingAICheck = null;
    checkWithAI(queuedSentence, queuedKeywords, queuedSource);
  }, AI_CHECK_DEBOUNCE_MS);
}

function runImmediateAICheck(sentence, keywords = [], source = 'sent') {
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
  checkWithAI(sentence, keywords, source);
}

function markUserInteracted() {
  if (!hasUserInteracted) {
    hasUserInteracted = true;
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
    scheduleAICheck(text, [], 'draft');
  }, { capture: true });
}

function setupSendWatcher() {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.key === 'Enter' && !event.shiftKey && isComposerTarget(target)) {
      markUserInteracted();
      runImmediateAICheck(getComposerText(), [], 'sent');
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
      runImmediateAICheck(getComposerText(), [], 'sent');
    }
  });
}

function logAssistantSnippet(url, snippet) {
  if (!snippet) {
    return;
  }
}

function stripMetadataPrefix(snippet) {
  if (!snippet) {
    return '';
  }
  const normalized = snippet.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  const parts = normalized.split(' ');
  let idx = 0;
  while (
    idx < parts.length &&
    /^[a-z0-9_.-]+$/i.test(parts[idx]) &&
    /[_0-9]/.test(parts[idx])
  ) {
    idx += 1;
  }
  if (idx < parts.length) {
    return parts.slice(idx).join(' ').trim();
  }
  return normalized;
}

function cleanAssistantSnippet(snippet) {
  const normalized = normalizeTextValue(snippet);
  const stripped = stripMetadataPrefix(normalized);
  if (!stripped) {
    return normalized;
  }
  return stripped;
}

function processAssistantSnippet(snippet, url, id = null) {
  if (!snippet) {
    return;
  }
  const cleaned = cleanAssistantSnippet(snippet);
  if (!cleaned) {
    return;
  }
  if (!recordAssistantMessage(cleaned, id)) {
    return;
  }
  runImmediateAICheck(cleaned, [], 'assistant');
  logAssistantSnippet(url, cleaned);
}

function handleAssistantPayload(payload, url, requestKey) {
  if (!hasUserInteracted || payload == null) {
    return;
  }
  const key = requestKey || getStreamRequestKey(url);

  const bufferSnippet = (snippet, id = null) => {
    const cleaned = cleanAssistantSnippet(snippet);
    if (!cleaned) {
      return;
    }
    bufferStreamSnippet(key, url, cleaned, id);
  };

  if (typeof payload === 'string') {
    const snippets = extractAssistantTextSnippets([payload]);
    snippets.forEach((snippet) => bufferSnippet(snippet));
    return;
  }

  const messages = extractAssistantMessages(payload);
  if (messages.length) {
    messages.forEach(({ text, id }) => bufferSnippet(text, id));
    return;
  }

  const snippets = extractAssistantTextSnippets([payload]);
  snippets.forEach((snippet) => bufferSnippet(snippet));
}

function normalizeTextValue(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (/^[\[{"]/.test(trimmed)) {
      try {
        return normalizeTextValue(JSON.parse(trimmed));
      } catch {
        // fallthrough to unescaped string
      }
    }
    const unescaped = unescapeJsonValue(trimmed);
    if (unescaped !== trimmed) {
      return normalizeTextValue(unescaped);
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeTextValue).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    if ('text' in value) {
      return normalizeTextValue(value.text);
    }
    if ('content' in value) {
      return normalizeTextValue(value.content);
    }
    if ('message' in value) {
      return normalizeTextValue(value.message);
    }
    if ('output' in value) {
      return normalizeTextValue(value.output);
    }
    return Object.values(value).map(normalizeTextValue).filter(Boolean).join(' ');
  }
  return '';
}

function findAssistantId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  for (const key of ASSISTANT_ID_KEYS) {
    const candidate = payload[key];
    if (candidate == null) {
      continue;
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' || typeof candidate === 'bigint') {
      return String(candidate);
    }
  }
  return null;
}

function extractAssistantMessages(payload, results = []) {
  if (!payload) {
    return results;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => extractAssistantMessages(item, results));
    return results;
  }
  if (typeof payload === 'object') {
    const role = payload.role ?? payload.author?.role ?? payload.sender?.role ?? payload.person?.role;
    if (role === 'assistant') {
      const text = normalizeTextValue(payload.content ?? payload.text ?? payload.message ?? payload.output);
      const id = findAssistantId(payload);
      if (text) {
        results.push({ text, id });
      }
    }
    Object.values(payload).forEach((child) => extractAssistantMessages(child, results));
  }
  return results;
}

function recordAssistantMessage(text, id) {
  if (!text) {
    return false;
  }
  if (id) {
    if (assistantProcessedIds.has(id)) {
      return false;
    }
    assistantProcessedIds.add(id);
    assistantIdQueue.push(id);
    if (assistantIdQueue.length > MAX_ASSISTANT_IDS) {
      const removed = assistantIdQueue.shift();
      if (removed) {
        assistantProcessedIds.delete(removed);
      }
    }
  }
  if (assistantPayloadHistory.has(text)) {
    return false;
  }
  assistantPayloadHistory.add(text);
  assistantPayloadQueue.push(text);
  if (assistantPayloadQueue.length > MAX_ASSISTANT_PAYLOADS) {
    const removed = assistantPayloadQueue.shift();
    if (removed) {
      assistantPayloadHistory.delete(removed);
    }
  }
  return true;
}

function recordAssistantPayload(text) {
  if (!text) {
    return false;
  }
  if (assistantPayloadHistory.has(text)) {
    return false;
  }
  assistantPayloadHistory.add(text);
  assistantPayloadQueue.push(text);
  if (assistantPayloadQueue.length > MAX_ASSISTANT_PAYLOADS) {
    const removed = assistantPayloadQueue.shift();
    if (removed) {
      assistantPayloadHistory.delete(removed);
    }
  }
  return true;
}

const NETWORK_BRIDGE_SOURCE = 'dialogueSafetyNetwork';
const NETWORK_REQUEST_TYPE = 'SAFETY_INTERCEPT_REQUEST';
const NETWORK_RESPONSE_TYPE = 'SAFETY_INTERCEPT_RESPONSE';
const STREAM_URL_SEGMENT = '/StreamGenerate';
const STREAM_FINALIZE_DELAY = 2000;
const streamState = new Map();
let networkBridgeListenerInitialized = false;

function getStreamRequestKey(url) {
  if (!url) {
    return '';
  }
  try {
    const parsed = new URL(url, window.location.href);
    const reqid = parsed.searchParams.get('_reqid');
    if (reqid) {
      return `${parsed.pathname}_${reqid}`;
    }
  } catch {
    // ignore
  }
  return url;
}

function finalizeStreamSnippet(key) {
  const state = streamState.get(key);
  if (!state) {
    return;
  }
  if (state.timer) {
    clearTimeout(state.timer);
  }
  streamState.delete(key);
  if (state.snippet) {
    processAssistantSnippet(state.snippet, state.url, state.id ?? key);
  }
}

function bufferStreamSnippet(key, url, snippet, id = null) {
  if (!key || !snippet) {
    return;
  }
  const state = streamState.get(key) ?? {};
  const text = snippet.trim();
  if (!text) {
    return;
  }
  const current = state.snippet ?? '';
  if (!current || text.length >= current.length) {
    state.snippet = text;
    state.url = url;
    state.id = id ?? state.id;
  }
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = setTimeout(() => finalizeStreamSnippet(key), STREAM_FINALIZE_DELAY);
  streamState.set(key, state);
}

function parseNetworkResponseText(text) {
  const results = [];
  if (!text) {
    return results;
  }
  const events = text.split(/\r?\n\r?\n/);
  const pushPayload = (payloadText) => {
    if (!payloadText) {
      return;
    }
    const trimmedPayload = payloadText.trim();
    if (!trimmedPayload) {
      return;
    }
    try {
      results.push(JSON.parse(trimmedPayload));
    } catch {
      results.push(trimmedPayload);
    }
  };

  for (const event of events) {
    const lines = event.split(/\r?\n/);
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith(")]}'")) {
        continue;
      }
      if (/^\d+$/.test(trimmedLine)) {
        continue;
      }
      const dataMatch = trimmedLine.match(/^data:\s*(.*)$/);
      if (dataMatch) {
        pushPayload(dataMatch[1]);
        continue;
      }
      const numericPrefixMatch = trimmedLine.match(/^(\d+)\s*(.+)$/);
      if (numericPrefixMatch && numericPrefixMatch[2]) {
        pushPayload(numericPrefixMatch[2]);
        continue;
      }
      pushPayload(trimmedLine);
    }
  }
  return results;
}

function isStreamUrl(url) {
  return typeof url === 'string' && url.includes(STREAM_URL_SEGMENT);
}

function unescapeJsonValue(value) {
  try {
    return JSON.parse(`"${value.replace(/\\n/g, '\\\\n')}"`);
  } catch {
    return value;
  }
}

function isLikelyAssistantText(text) {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith(")]}'")) {
    return false;
  }
  if (/^\d+\s*\[\[/.test(trimmed)) {
    return false;
  }
  if (/^\[.*\]$/.test(trimmed)) {
    return false;
  }
  if (trimmed.length < 10) {
    return false;
  }
  if (!/\s/.test(trimmed)) {
    return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return false;
  }
  if (!/[A-Za-z]/.test(trimmed)) {
    return false;
  }
  return true;
}

function extractAssistantTextSnippets(payloads) {
  const snippets = new Set();

  function walk(value) {
    if (typeof value === 'string') {
      const candidate = value.trim();
      if (!candidate) {
        return;
      }
      const normalized = normalizeTextValue(candidate);
      const snippet = normalized.trim();
      if (isLikelyAssistantText(snippet)) {
        snippets.add(snippet);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  }

  payloads.forEach((payload) => walk(payload));
  return Array.from(snippets);
}

function handleNetworkResponse(text, url) {
  if (!text || !isStreamUrl(url)) {
    return;
  }
  const payloads = parseNetworkResponseText(text);
  if (!payloads.length) {
    return;
  }
  payloads.forEach((payload) => handleAssistantPayload(payload, url));
}

function handleNetworkMessage(event) {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || data.source !== NETWORK_BRIDGE_SOURCE) {
    return;
  }
  if (data.type === NETWORK_RESPONSE_TYPE) {
    handleNetworkResponse(data.text ?? '', data.url ?? '');
    } else if (data.type === NETWORK_REQUEST_TYPE && isStreamUrl(data.url)) {
      // skip logging request payload to avoid noise
    }
}

function setupNetworkBridgeListener() {
  if (networkBridgeListenerInitialized) {
    return;
  }
  networkBridgeListenerInitialized = true;
  window.addEventListener('message', handleNetworkMessage);
}

function setupNanoTriggers() {
  if (nanoTriggersSetup) {
    return;
  }
  nanoTriggersSetup = true;
  setupDraftWatcher();
  setupSendWatcher();
  setupNetworkBridgeListener();
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

function checkWithAI(sentence, keywords, source = 'draft') {
  if (!sentence) {
    return;
  }
  const payload = {
    action: 'check_with_ai',
    sentence,
    keywords,
    userActivated: navigator.userActivation?.isActive ?? true,
    source,
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
    source: response.source ?? 'unknown',
    sentence: response.sentence ?? '',
    timestamp: Date.now(),
  };
  safeStorageSet({ [AI_DECISION_KEY]: decision }, () => {});
  document.body.dataset.dialogueSafetyAlert = decision.safe ? 'safe' : 'unsafe';
  const entry = {
    type: 'ai-decision',
    text: `${decision.safe ? 'Safe' : 'Unsafe'} (${decision.source}): ${decision.reason}`,
    source: decision.source,
    safe: decision.safe,
    confidence: decision.confidence,
    sentence: decision.sentence,
  };
  pushLogEntry(entry);
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
