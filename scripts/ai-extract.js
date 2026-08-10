/**
 * scripts/ai-extract.js v16.0
 * Unified response detection, extraction, AI-powered fallback + health-check.
 * Мerged: response.js + ai-extract.js (selectors → spec.js as SSOT).
 *
 * v16.0: response.js merged — detectResponseElements, readResponse,
 *        isGLMResponseDone, extractLastResponse, healthCheck.
 *        Str 5 (longest prose) scoped to chat container (was O(n) on all divs).
 * v15.3: detectProvider и селекторы делегированы в spec.js (window.__spec)
 * v14.0: Создан как Stagehand extract() + fallback-цепочки
 *
 * Removed (no consumers): formatCheckpoint, needsContextRepeat, extractAllResponses.
 *
 * Exports: window.__aiExtract
 *   .extract()          — извлечь ответ, все стратегии
 *   .read(provider)     — универсальное чтение (network → DOM)
 *   .isDone(provider)   — проверка готовности ответа
 *   .extractLast(provider) — текст + источник (network/dom)
 *   .detect()           — детекция состояния страницы
 *   .diagnose()         — полная диагностика
 *   .healthCheck()      — проверка всех селекторов
 *
 * Вызов: browser_evaluate(filename='ai-extract.js')
 * Затем: browser_evaluate('window.__aiExtract.extract()')
 */
(() => {
  if (window.__aiExtract) {
    return { status: 'already_initialized' };
  }

  const spec = window.__spec;
  const provider = spec.detectProvider();

  // === Shared: fallback chain from spec.js ===
  function detectResponseElements(p) {
    const strategies = spec.getResponseStrategies(p);
    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = strategies[i]();
        if (result.length > 0) {
          if (i > 0) {
            console.warn('[ai-extract] Primary selector failed for ' + p + ', used fallback #' + (i + 1));
          }
          return result;
        }
      } catch (e) { /* next strategy */ }
    }
    throw new Error('All response detection strategies failed for ' + p + ' — DOM changed?');
  }

  // === Strategy 2: Accessibility roles ===
  function extractByRole() {
    const roles = ['article', 'log', 'region', 'status'];
    for (const role of roles) {
      const els = document.querySelectorAll(`[role="${role}"]`);
      if (els.length > 0) {
        const last = els[els.length - 1];
        const text = (last.innerText || '').trim();
        if (text.length > 20) {
          return { text, source: `role:${role}`, len: text.length };
        }
      }
    }
    return null;
  }

  // === Strategy 3: Message container heuristic ===
  function extractByMessageContainer() {
    const patterns = [
      '[class*="message"]',
      '[class*="chat-message"]',
      '[class*="response"]',
      '[class*="assistant"]',
      '[data-role="assistant"]',
      '[data-message-role="assistant"]',
    ];

    for (const sel of patterns) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          for (let i = els.length - 1; i >= 0; i--) {
            const text = (els[i].innerText || '').trim();
            if (text.length > 20) {
              const btnCount = els[i].querySelectorAll('button').length;
              const linkCount = els[i].querySelectorAll('a').length;
              const wordCount = text.split(/\s+/).length;
              if (wordCount > 5 && btnCount < 10 && linkCount < 10) {
                return { text, source: `container:${sel}`, len: text.length };
              }
            }
          }
        }
      } catch { /* invalid selector */ }
    }
    return null;
  }

  // === Strategy 4: Spinner area ===
  function extractNearSpinner(p) {
    const sels = spec.SELECTORS[p] || spec.SELECTORS.glm;
    const spinnerPatterns = [sels.generation.spinner, sels.generation.loading, sels.generation.thinking];

    for (const sel of spinnerPatterns) {
      const spinner = document.querySelector(sel);
      if (!spinner) continue;

      let container = spinner.parentElement;
      for (let depth = 0; depth < 5 && container; depth++) {
        const text = (container.innerText || '').trim();
        if (text.length > 20) {
          const cleanText = text.replace(/⏳|🔄|💬|.../g, '').trim();
          if (cleanText.length > 20) {
            return { text: cleanText, source: `near-spinner:${sel}`, len: cleanText.length };
          }
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  // === Strategy 5: Longest prose — SCOPED to chat container ===
  // OPTIMIZATION: вместо O(n) на весь DOM, ищем только внутри chat-container
  function extractByLongestProse(p) {
    const sels = spec.SELECTORS[p] || spec.SELECTORS.glm;

    // 1. Find the chat container — scope search to it
    let searchRoot = null;
    const chatSelectors = [
      '[class*="chat-container"]',
      '[class*="chat"]',
      '[class*="conversation"]',
      '[role="log"]',
      '[role="main"]',
      'main',
    ];
    for (const cs of chatSelectors) {
      const found = document.querySelector(cs);
      if (found) { searchRoot = found; break; }
    }
    if (!searchRoot) searchRoot = document.body;

    // 2. Scan only within the chat container
    const blockSelectors = 'div, section, article, p, pre, code';
    const blocks = searchRoot.querySelectorAll(blockSelectors);
    let best = null;
    let bestLen = 0;

    for (const block of blocks) {
      const children = block.querySelectorAll(blockSelectors);
      if (children.length > 20) continue;

      const text = (block.innerText || '').trim();
      const wordCount = text.split(/\s+/).length;
      const hasCodeBlocks = block.querySelectorAll('pre, code').length > 0;
      const hasMarkdown = text.includes('```') || text.includes('##');

      const isProse = (wordCount > 20 && text.length > bestLen) ||
                      (hasCodeBlocks && text.length > 100) ||
                      (hasMarkdown && text.length > 100);

      if (isProse && text.length > bestLen) {
        const tag = block.tagName.toLowerCase();
        const cls = block.className || '';
        if (tag === 'header' || tag === 'footer' || tag === 'nav') continue;
        if (cls.includes('header') || cls.includes('footer') || cls.includes('nav') ||
            cls.includes('sidebar') || cls.includes('menu') || cls.includes('toolbar')) continue;

        best = block;
        bestLen = text.length;
      }
    }

    if (best) {
      const text = (best.innerText || '').trim();
      return { text: text.slice(0, 10000), source: 'longest-prose', len: text.length };
    }
    return null;
  }

  // === readResponse — universal read (from response.js) ===
  function readResponse(p) {
    // Priority 1: network buffer
    const netTokens = window.__netBuffer?.getLatestTokens();
    if (netTokens && netTokens.length > 0) {
      return netTokens.replace(/^Thought Process\n/, '').trim();
    }
    // Priority 2: DOM-selectors
    const elements = detectResponseElements(p);
    const last = elements[elements.length - 1];
    if (!last) return '';
    const text = last.innerText || '';
    return text.replace(/^Thought Process\n/, '').trim();
  }

  // === isGLMResponseDone — readiness check ===
  function isGLMResponseDone(p) {
    const prose = detectResponseElements(p || 'glm');
    const last = prose[prose.length - 1];
    if (!last) return { done: false, textLen: 0 };

    const parent = last.closest('[class*="message"]') || last.parentElement?.parentElement;
    const btns = parent ? parent.querySelectorAll('button') : [];
    const actionBtns = Array.from(btns).filter(b => b.className.includes('visible') && b.querySelector('svg'));
    const spinner = !!document.querySelector(spec.SELECTORS.glm.generation.spinner);

    const netLatest = window.__netBuffer?.getLatest();
    const netDone = netLatest && !netLatest.error && netLatest.sseTokens?.length > 0;

    return {
      done: (actionBtns.length >= 2 && !spinner) || netDone,
      textLen: last.innerText.length,
      text: last.innerText,
      spinner,
      source: netDone ? 'network' : 'dom',
    };
  }

  // === extractLastResponse — text + source info ===
  function extractLastResponse(p) {
    const netTokens = window.__netBuffer?.getLatestTokens();
    if (netTokens && netTokens.length > 0) {
      const text = netTokens.replace(/^Thought Process\n/, '').trim();
      return { text, len: text.length, source: 'network' };
    }
    const text = readResponse(p);
    return { text, len: text.length, source: 'dom' };
  }

  // === healthCheck — verify all selectors + network hooks ===
  function healthCheck() {
    const results = {};
    for (const p of ['glm', 'qwen', 'deepseek', 'kimi']) {
      try {
        const elements = detectResponseElements(p);
        results[p] = { ok: true, count: elements.length };
      } catch (e) {
        results[p] = { ok: false, error: e.message };
      }
    }
    results._network = {
      installed: !!window.__netHooksInstalled,
      bufferLen: window.__netBuffer?.entries?.length || 0,
    };
    results._session = {
      installed: !!window.__session,
    };
    return results;
  }

  // === Main API: window.__aiExtract ===
  window.__aiExtract = {
    provider,

    /**
     * Извлечь ответ — попробовать все стратегии
     * @returns {{text, source, len, strategy}|null}
     */
    extract() {
      // Priority 0: network buffer
      const netTokens = window.__netBuffer?.getLatestTokens?.();
      if (netTokens && netTokens.length > 0) {
        return { text: netTokens, source: 'network', len: netTokens.length, strategy: 0 };
      }

      // Priority 1: проверенные селекторы из spec.js
      try {
        const sels = spec.SELECTORS[this.provider] || spec.SELECTORS.glm;
        const all = [sels.response.primary, ...sels.response.fallbacks];
        for (const sel of all) {
          try {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
              const last = els[els.length - 1];
              const text = (last.innerText || '').replace(/^Thought Process\n/, '').trim();
              if (text.length > 20) {
                return { text, source: `selector:${sel}`, len: text.length, strategy: 1 };
              }
            }
          } catch {}
        }
      } catch {}

      // Priority 2: Accessibility roles
      const byRole = extractByRole();
      if (byRole) return { ...byRole, strategy: 2 };

      // Priority 3: Message containers
      const byContainer = extractByMessageContainer();
      if (byContainer) return { ...byContainer, strategy: 3 };

      // Priority 4: Near spinner
      const bySpinner = extractNearSpinner(this.provider);
      if (bySpinner) return { ...bySpinner, strategy: 4 };

      // Priority 5: Longest prose (scoped to chat container)
      const byProse = extractByLongestProse(this.provider);
      if (byProse) return { ...byProse, strategy: 5 };

      return null;
    },

    /**
     * Универсальное чтение ответа (network → DOM)
     * @param {string} [p] — optional provider override
     * @returns {string}
     */
    read(p) { return readResponse(p || this.provider); },

    /**
     * Проверка готовности ответа
     * @param {string} [p] — optional provider override
     * @returns {{done, textLen, text, spinner, source}}
     */
    isDone(p) { return isGLMResponseDone(p); },

    /**
     * Извлечь последний ответ с информацией об источнике
     * @param {string} [p] — optional provider override
     * @returns {{text, len, source}}
     */
    extractLast(p) { return extractLastResponse(p || this.provider); },

    /**
     * Детекция состояния страницы
     * @returns {{hasInput, hasResponse, hasSpinner, provider, strategies}}
     */
    detect() {
      const sels = spec.SELECTORS[this.provider] || spec.SELECTORS.glm;
      const hasInput = !!document.querySelector(sels.input.primary + ', ' + sels.input.fallbacks.join(', '));
      const hasSpinner = !!document.querySelector(sels.generation.spinner + ', ' + sels.generation.loading);

      return {
        provider: this.provider,
        url: location.href,
        hasInput,
        hasSpinner,
        networkBuffer: window.__netBuffer?.stats?.() || null,
        strategies: {
          role: !!extractByRole(),
          container: !!extractByMessageContainer(),
          prose: !!extractByLongestProse(this.provider),
          spinner: !!extractNearSpinner(this.provider),
        },
      };
    },

    /**
     * Полная диагностика — что видно на странице
     */
    diagnose() {
      const extractResult = this.extract();
      const detectResult = this.detect();

      return {
        extract: extractResult,
        detect: detectResult,
        dom: {
          allDivs: document.querySelectorAll('div').length,
          allArticles: document.querySelectorAll('article, [role="article"]').length,
          allButtons: document.querySelectorAll('button').length,
          bodyTextLen: (document.body?.innerText || '').length,
        },
        hint: extractResult
          ? `Found response via ${extractResult.source} (${extractResult.len} chars)`
          : 'No response found — all strategies exhausted',
      };
    },

    /**
     * Проверка всех селекторов + network hooks
     */
    healthCheck() { return healthCheck(); },
  };

  return {
    status: 'initialized',
    provider,
    hint: 'Use window.__aiExtract.extract() / .read() / .isDone() / .extractLast() / .detect() / .diagnose() / .healthCheck()',
  };
})()
