(function () {
  const DEFAULT_API_ORIGIN = "http://localhost:4173";
  const DEFAULT_MATCH_ENDPOINT = "/api/match-map";
  const MATCH_DATA_SCRIPT_ID = "sl-match-map-data";
  const HIGHLIGHT_STYLE_ID = "sl-smart-link-style";

  const MODE_VISITOR = "visitor";
  const MODE_ADMIN = "admin";

  const state = {
    matches: [],
    observer: null,
    highlightTimer: null,
    initialized: false,
    mode: MODE_VISITOR,
    visitorListenerAttached: false
  };

  const getMatchIdentifier = (match) =>
    match?.page_match_id ??
    match?.id ??
    match?.pageMatchId ??
    match?.pageMatchID ??
    match?.pageMatchid ??
    match?.pageMatch ??
    null;

  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const whenDOMReady = (cb) => {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      cb();
    } else {
      document.addEventListener("DOMContentLoaded", cb);
    }
  };

  const ensureHighlightStyle = () => {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `
      .sl-smart-link {
        border-bottom: 2px solid #00bfa5;
        background-color: rgba(0, 191, 165, 0.15);
        cursor: pointer;
        color: #000;
        transition: all 0.2s ease;
      }
      .sl-smart-link:hover {
        background-color: #00bfa5;
        color: white;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      }
      .sl-smart-link::after {
        content: " ▶";
        font-size: 0.8em;
        color: #00bfa5;
      }
      .sl-smart-link.sl-smart-link--inactive {
        border-color: rgba(148, 163, 184, 0.8);
        background-color: rgba(239, 241, 245, 0.85);
        color: rgba(55, 65, 81, 0.9);
        box-shadow: none;
        cursor: pointer;
      }
      .sl-smart-link.sl-smart-link--inactive::after {
        color: rgba(148, 163, 184, 0.9);
      }
      body.sl-visitor-mode .sl-smart-link.sl-smart-link--inactive {
        display: none;
      }
      #sl-visitor-player {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 320px;
        max-width: 90vw;
        background: rgba(15, 23, 42, 0.9);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.4);
        color: #fff;
        overflow: hidden;
        z-index: 2147483647;
        transform: translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.28s ease, transform 0.28s ease;
      }
      #sl-visitor-player.visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      #sl-visitor-player .sl-visitor-player__header {
        padding: 8px 12px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.85);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        font-weight: 600;
      }
      #sl-visitor-player .sl-visitor-player__frame {
        width: 100%;
        height: 180px;
        background: #000;
        border-radius: 0 0 16px 16px;
        overflow: hidden;
      }
      #sl-visitor-player iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
    `;
    document.head.appendChild(style);
  };

  const persistMatches = (matches) => {
    window.__SL_MATCH_MAP__ = matches;
    const updateScript = () => {
      let script = document.getElementById(MATCH_DATA_SCRIPT_ID);
      if (!script) {
        script = document.createElement("script");
        script.id = MATCH_DATA_SCRIPT_ID;
        script.type = "application/json";
        document.body.appendChild(script);
      }
      script.textContent = JSON.stringify(matches);
    };
    if (document.body) {
      updateScript();
    } else {
      whenDOMReady(updateScript);
    }
  };

  const highlightMatches = (matches) => {
    if (!matches.length || !document.body) {
      return;
    }

    const disallowedTags = /SCRIPT|STYLE|A|BUTTON|NOSCRIPT|TEXTAREA|INPUT/;

    matches.forEach((match, matchIndex) => {
      console.log("[sl-admin-script] processing match", matchIndex, match?.phrase, match?.status);
      if (!match || !match.phrase) return;
      const target = normalize(match.phrase);
      if (!target) return;

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;

      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || parent.closest(".sl-smart-link")) continue;
        if (disallowedTags.test(parent.tagName)) continue;

        const current = normalize(node.nodeValue);
        if (!current.includes(target)) continue;

        const fragment = document.createDocumentFragment();
        const regex = new RegExp(`(${escapeRegex(target)})`, "gi");
        const parts = current.split(regex);

        parts.forEach((part) => {
          if (!part) return;
            if (part.toLowerCase() === target.toLowerCase()) {
              const span = document.createElement("span");
              span.className = "sl-smart-link";
              span.dataset.matchIndex = matchIndex;
              const matchId = getMatchIdentifier(match);
              if (matchId) {
                span.dataset.pageMatchId = String(matchId);
              }
              if (match.status === "inactive") {
                console.log("[sl-admin-script] marking inactive span", matchId);
              }
      if (match.status === "inactive") {
        span.classList.add("sl-smart-link--inactive");
      }
              span.textContent = part;
              fragment.appendChild(span);
            } else {
            fragment.appendChild(document.createTextNode(part));
          }
        });

        parent.replaceChild(fragment, node);
      }
    });
  };

  const scheduleHighlight = () => {
    if (state.highlightTimer) {
      clearTimeout(state.highlightTimer);
    }
    state.highlightTimer = setTimeout(() => {
      highlightMatches(state.matches);
    }, 120);
  };

  const setupObserver = () => {
    if (state.observer || typeof MutationObserver === "undefined") return;
    state.observer = new MutationObserver(() => {
      scheduleHighlight();
    });
    state.observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  let playerState = null;
  const toVimeoPlayerUrl = (value) => {
    if (typeof value !== "string") return value || "";

    const matches = [
      /vimeo\.com\/(\d+)/,
      /player\.vimeo\.com\/video\/(\d+)/
    ];
    let videoId = null;

    for (const pattern of matches) {
      const found = value.match(pattern);
      if (found) {
        videoId = found[1];
        break;
      }
    }

    if (!videoId) return value;

    const timestampMatch = value.match(/#t=(\d+)/);
    const suffix = timestampMatch ? `#t=${timestampMatch[1]}s` : "";
    return `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0${suffix}`;
  };

  const ensureVisitorPlayer = () => {
    if (playerState) return playerState;
    const container = document.createElement("div");
    container.id = "sl-visitor-player";
    container.innerHTML = `
      <div class="sl-visitor-player__header">We picked this video for you...</div>
      <div class="sl-visitor-player__frame">
        <iframe allow="autoplay; fullscreen"></iframe>
      </div>
    `;
    document.body.appendChild(container);
    const iframe = container.querySelector("iframe");
    playerState = { container, iframe };
    return playerState;
  };

  const showVisitorPlayer = (match) => {
    if (!match) return;
    const player = ensureVisitorPlayer();
    const iframe = player.iframe;
    if (iframe) {
      iframe.src = toVimeoPlayerUrl(match.video_url);
    }
    player.container.classList.add("visible");
  };

  const hideVisitorPlayer = () => {
    if (!playerState) return;
    if (playerState.iframe) {
      playerState.iframe.src = "";
    }
    playerState.container.classList.remove("visible");
  };

    const handleVisitorClick = (event) => {
      if (state.mode !== MODE_VISITOR) return;
      const target = (event.target || event.srcElement);
      if (!(target instanceof Element)) return;
      const matchEl = target.closest(".sl-smart-link");
      if (!matchEl) return;
      const idxAttr = matchEl.getAttribute("data-match-index");
      if (!idxAttr) return;
      const index = Number(idxAttr);
      if (Number.isNaN(index)) return;
      const match = state.matches[index];
      if (!match || match.status === "inactive") return;
    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopImmediatePropagation();
    event.stopPropagation();
      showVisitorPlayer(match);
    };

  const setupVisitorClicks = () => {
    if (state.visitorListenerAttached) return;
    state.visitorListenerAttached = true;
    document.addEventListener("click", handleVisitorClick);
  };

  const fetchMatchMap = async ({ providerId, apiOrigin, endpoint, limit }) => {
    const origin = (apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, "");
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${origin}${cleanEndpoint}?provider_id=${encodeURIComponent(providerId)}&limit=${encodeURIComponent(
      limit
    )}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`match-map fetch failed (${response.status})`);
    }
    return response.json();
  };

  const applyMatches = (matches) => {
    state.matches = Array.isArray(matches) ? matches.slice() : [];
    persistMatches(state.matches);
    whenDOMReady(() => {
      ensureHighlightStyle();
      highlightMatches(state.matches);
      setupObserver();
      ensureVisitorPlayer();
      setupVisitorClicks();
    });
  };

  const markSpansInactive = (pageMatchId) => {
    const spans = Array.from(document.querySelectorAll(`.sl-smart-link[data-page-match-id="${pageMatchId}"]`));
    if (!spans.length) {
      console.log("[sl-admin-script] no spans found for", pageMatchId);
      return;
    }
    spans.forEach((span) => {
      span.classList.add("sl-smart-link--inactive");
      span.style.opacity = "1";
    });
  };

  const removeMatchHighlight = (pageMatchId) => {
    console.log("[sl-admin-script] removeMatchHighlight called", pageMatchId);
    const normalized = getMatchIdentifier({ page_match_id: pageMatchId });
    if (!normalized) return;
    const targetId = String(normalized);
    markSpansInactive(targetId);
    state.matches = state.matches.filter((match) => {
      const identifier = getMatchIdentifier(match);
      return !(identifier && String(identifier) === targetId);
    });
    window.__SL_MATCH_MAP__ = state.matches;
    persistMatches(state.matches);
  };

  const clearInactiveSpans = (pageMatchId) => {
    const spans = document.querySelectorAll(`.sl-smart-link[data-page-match-id="${pageMatchId}"].sl-smart-link--inactive`);
    spans.forEach((span) => {
      span.classList.remove("sl-smart-link--inactive");
      span.style.pointerEvents = "";
    });
  };

  const applyMode = (mode) => {
    state.mode = mode === MODE_ADMIN ? MODE_ADMIN : MODE_VISITOR;
    const root = document.documentElement;
    const body = document.body;
    if (root) {
      root.classList.toggle("sl-admin-mode", state.mode === MODE_ADMIN);
      root.classList.toggle("sl-visitor-mode", state.mode === MODE_VISITOR);
    }
    if (body) {
      body.classList.toggle("sl-admin-mode", state.mode === MODE_ADMIN);
      body.classList.toggle("sl-visitor-mode", state.mode === MODE_VISITOR);
    }
  };

  const addMatchHighlight = (match) => {
    console.log("[sl-admin-script] addMatchHighlight called", match?.page_match_id, match)
    if (!match) return;
    const matchId = getMatchIdentifier(match);
    if (!matchId) return;
    const targetId = String(matchId);
    if (!match.phrase) {
      console.warn("[sl-admin-script] addMatchHighlight missing phrase for", targetId);
      return;
    }

    clearInactiveSpans(targetId);

    state.matches = state.matches.filter((entry) => {
      const identifier = getMatchIdentifier(entry);
      return !(identifier && String(identifier) === targetId);
    });

    const normalizedMatch = { ...match, status: "active" };
    state.matches.push(normalizedMatch);
    window.__SL_MATCH_MAP__ = state.matches;
    persistMatches(state.matches);

    whenDOMReady(() => {
      ensureHighlightStyle();
      highlightMatches([normalizedMatch]);
    });
  };

  const init = async (config = {}) => {
    if (state.initialized) {
      return;
    }
    state.initialized = true;

    const { providerId, apiOrigin, endpoint = DEFAULT_MATCH_ENDPOINT, limit = 50 } = config;
    if (!providerId) {
      console.error("[sl-admin-script] providerId is required");
      return;
    }

    try {
      const matches = await fetchMatchMap({ providerId, apiOrigin, endpoint, limit });
      applyMatches(matches);
    } catch (error) {
      console.error("[sl-admin-script] failed to load matches", error);
    }
  };

  window.__SL_adminScript = {
    init
  };
  window.__SL_removeMatchHighlight = removeMatchHighlight;
  window.__SL_addMatchHighlight = addMatchHighlight;
  window.__SL_setMode = (mode) => {
    console.log("[sl-admin-script] set mode", mode);
    applyMode(mode);
  };
  window.__SL_getMode = () => state.mode;

  applyMode(state.mode);
})();
