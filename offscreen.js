const LANGUAGE_OPTIONS = {
  languages: ['en'],
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};
const log = (message, detail) => {
  console.info('[Dialogue Safety][Nano]', message, detail ?? '');
};

let session = null;
let availability = 'unknown';
let preferredOptions = null;

function ensureAPI() {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('LanguageModel API is unavailable');
  }
  return LanguageModel;
}

async function buildOptions() {
  const params = await ensureAPI().params();
  return {
    topK: params.defaultTopK,
    temperature: params.defaultTemperature,
    ...LANGUAGE_OPTIONS,
  };
}

async function ensureSession(userActivated) {
  if (!userActivated) {
    return { status: 'waiting_for_user_activation', availability };
  }
  if (session) {
    availability = 'ready';
    return { status: 'ready', availability };
  }

  const options = await buildOptions();
  preferredOptions = options;
  availability = await ensureAPI().availability(options);
  log('availability', availability);
  if (availability === 'unavailable') {
    return { status: 'error', availability };
  }

  const created = await ensureAPI().create({
    ...options,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        const percent = Math.round((event.loaded ?? 0) * 100);
        log('downloadprogress', `${percent}%`);
      });
    },
  });

  session = created;
  availability = 'ready';
  log('session ready');
  return { status: 'ready', availability };
}

function getStatus() {
  return {
    availability,
    ready: Boolean(session),
    options: preferredOptions,
  };
}

async function runPrompt(sentence, keywords = []) {
  if (!sentence) {
    return { status: 'ignored', reason: 'no text provided' };
  }
  const status = await ensureSession(true);
  if (status.status !== 'ready' || !session) {
    return {
      status: status.status ?? 'error',
      availability,
      reason: 'session not ready',
    };
  }
  const promptBody = `You are a safety analyst focused on safety. Respond with JSON: {"safe":true|false,"reason":"explain","confidence":0.0-1.0}. Sentence: ${sentence}`;
  try {
    const schema = {
      type: 'object',
      properties: {
        safe: { type: 'boolean' },
        reason: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['safe', 'reason'],
      additionalProperties: false,
    };
    const output = await session.prompt(promptBody, {
      responseConstraint: schema,
      omitResponseConstraintInput: true,
    });
    log('prompt output', output);
    let parsed = null;
    try {
      parsed = JSON.parse(output);
    } catch (parseError) {
      log('prompt parse failed', parseError);
      return { status: 'error', error: 'prompt response not JSON', raw: output, availability };
    }
    return {
      status: 'ok',
      ...parsed,
      confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : 0,
      output,
      sentence,
      keywords,
      availability,
    };
  } catch (error) {
    log('prompt failed', error?.message ?? error);
    return {
      status: 'error',
      error: error?.message ?? 'prompt failed',
      availability,
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }
  if (message.action === 'offscreen_ensure_language_model') {
    ensureSession(Boolean(message.userActivated))
      .then(sendResponse)
      .catch((error) => {
        log('session error', error?.message ?? error);
        sendResponse({ status: 'error', availability, error: error?.message ?? 'failed' });
      });
    return true;
  }
  if (message.action === 'offscreen_language_model_status') {
    sendResponse(getStatus());
    return;
  }
  if (message.action === 'offscreen_prompt') {
    runPrompt(message.sentence, message.keywords)
      .then(sendResponse)
      .catch((error) => {
        log('prompt error', error?.message ?? error);
        sendResponse({ status: 'error', availability, error: error?.message ?? 'prompt failed' });
      });
    return true;
  }
});
