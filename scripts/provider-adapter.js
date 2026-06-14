/**
 * scripts/provider-adapter.js v14.0
 * Унифицированный провайдер-агностик API — единый интерфейс для всех чатов.
 *
 * ПРОБЛЕМА: каждый провайдер — свой набор селекторов и логики.
 * РЕШЕНИЕ: ProviderAdapter с единым интерфейсом {navigate, detect, send, read, monitor},
 * где каждый провайдер реализует конкретные стратегии.
 *
 * Вдохновлено: WebModel (унифицированный API) + Stagehand (observe/extract/act)
 *
 * Вызов: browser_evaluate(filename='provider-adapter.js')
 * Затем: browser_evaluate('window.__adapter.send("prompt text")')
 *        browser_evaluate('window.__adapter.read()')
 *        browser_evaluate('window.__adapter.monitor()')
 */
(() => {
  if (window.__adapter) {
    return { status: 'already_initialized', provider: window.__adapter.provider };
  }

  // === Определяем провайдера ===
  const host = location.hostname;
  const providerKey = host.includes('z.ai') ? 'glm'
                    : host.includes('qwen') ? 'qwen'
                    : host.includes('deepseek') ? 'deepseek'
                    : 'unknown';

  // === Спецификации провайдеров ===
  const PROVIDERS = {
    glm: {
      name: 'GLM',
      baseUrl: 'https://chat.z.ai',
      chatPattern: '/c/',
      input: {
        primary: '#chat-input',
        fallbacks: ['textarea[class*="input"]', 'textarea'],
      },
      response: {
        primary: '.markdown-prose',
        fallbacks: ['[class*="prose"]', '[data-message-role="assistant"]'],
      },
      generation: {
        spinner: '[class*="spinner"]',
        stop: 'button:has-text("Stop")',
        thinking: '[class*="thinking"]',
      },
      done: {
        type: 'svg-buttons', // GLM использует SVG-иконки без текста
        minButtons: 2,
        selector: 'button svg',
      },
      modes: {
        agent: '.toolbar-icon.agent',
        deepThink: '[class*="thinking-toggle"]',
        webSearch: '.toolbar-icon.search',
      },
      files: {
        input: 'input[type="file"]',
        blockedExtensions: ['.java', '.js', '.ts', '.kt', '.scala', '.go', '.rs', '.cpp'],
      },
    },
    qwen: {
      name: 'Qwen',
      baseUrl: 'https://chat.qwen.ai',
      chatPattern: '/c/',
      input: {
        primary: 'textarea.message-input-textarea',
        fallbacks: ['textarea[class*="input"]', 'textarea'],
      },
      response: {
        primary: '[class*="message-content"]',
        fallbacks: ['.markdown-body', '[role="article"]'],
      },
      generation: {
        spinner: '[class*="loading"]',
        stop: 'button:has-text("Stop")',
        thinking: '[class*="thinking"]',
      },
      done: {
        type: 'text-buttons',
        copyText: 'Copy',
        regenerateText: 'Regenerate',
      },
      modes: {
        search: '[class*="search-toggle"]',
        modelSelect: '[class*="model-select"]',
      },
      files: {
        input: 'input[type="file"]',
      },
    },
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://chat.deepseek.com',
      chatPattern: '/a/chat/s/',
      input: {
        primary: 'textarea',
        fallbacks: ['textarea[class*="input"]'],
      },
      response: {
        primary: '.ds-markdown',
        fallbacks: ['[class*="markdown"]', '[role="article"]'],
      },
      generation: {
        spinner: '[class*="loading"]',
        stop: 'button:has-text("Stop")',
        thinking: '[class*="think"]',
      },
      done: {
        type: 'text-buttons',
        copyText: 'Copy',
        regenerateText: 'Regenerate',
      },
      modes: {
        deepThink: '[class*="deepthink"], [class*="reasoner"]',
      },
      files: {
        input: 'input[type="file"]',
      },
    },
  };

  const spec = PROVIDERS[providerKey];
  if (!spec) {
    return { error: 'unknown_provider', host, hint: 'Navigate to a supported chat provider first' };
  }

  // === Утилиты ===

  /** Найти элемент через fallback-цепочку */
  function findElement(selectorSpec) {
    const selectors = [selectorSpec.primary, ...(selectorSpec.fallbacks || [])];
    for (let i = 0; i < selectors.length; i++) {
      try {
        const el = document.querySelector(selectors[i]);
        if (el) {
          if (i > 0) {
            console.warn(`[provider-adapter] Primary selector "${selectors[0]}" failed, used fallback "${selectors[i]}"`);
          }
          return el;
        }
      } catch (e) {
        console.warn(`[provider-adapter] Invalid selector "${selectors[i]}":`, e.message);
      }
    }
    return null;
  }

  /** Найти все элементы через fallback-цепочку */
  function findElements(selectorSpec) {
    const selectors = [selectorSpec.primary, ...(selectorSpec.fallbacks || [])];
    for (let i = 0; i < selectors.length; i++) {
      try {
        const els = document.querySelectorAll(selectors[i]);
        if (els.length > 0) {
          if (i > 0) {
            console.warn(`[provider-adapter] Primary selector "${selectors[0]}" failed, used fallback "${selectors[i]}"`);
          }
          return els;
        }
      } catch (e) {
        console.warn(`[provider-adapter] Invalid selector "${selectors[i]}":`, e.message);
      }
    }
    return [];
  }

  /** Human-like input: установить значение через native setter + events */
  function humanInput(textarea, text) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, text);
    } else {
      textarea.value = text;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // === Адаптер ===
  window.__adapter = {
    provider: providerKey,
    spec,

    /** Определить состояние страницы */
    observe() {
      const textarea = findElement(spec.input);
      const responseEls = findElements(spec.response);
      const lastResponse = responseEls[responseEls.length - 1];
      const spinner = document.querySelector(spec.generation.spinner);
      const thinking = document.querySelector(spec.generation.thinking);

      // Определить done
      let done = false;
      if (spec.done.type === 'svg-buttons') {
        const parent = lastResponse?.closest('[class*="message"]') || lastResponse?.parentElement?.parentElement;
        const btns = parent ? Array.from(parent.querySelectorAll('button')).filter(b => b.querySelector('svg')) : [];
        done = btns.length >= spec.done.minButtons && !spinner;
      } else if (spec.done.type === 'text-buttons') {
        const parent = lastResponse?.closest('[class*="message"]') || lastResponse?.parentElement?.parentElement;
        const btns = parent ? parent.querySelectorAll('button') : [];
        done = Array.from(btns).some(b => b.textContent?.includes(spec.done.copyText)) && !spinner;
      }

      // Проверить network buffer (если установлен network-hooks.js)
      const netLatest = window.__netBuffer?.getLatest();
      const netTokens = window.__netBuffer?.getLatestTokens();

      return {
        provider: providerKey,
        url: location.href,
        hasInput: !!textarea,
        inputEmpty: textarea ? textarea.value.trim().length === 0 : true,
        responseCount: responseEls.length,
        lastResponseLen: lastResponse?.innerText?.length || 0,
        lastResponsePreview: (lastResponse?.innerText || '').slice(0, 300),
        spinner: !!spinner,
        thinking: !!thinking,
        done,
        hasNetworkData: !!netLatest,
        networkTokensLen: netTokens?.length || 0,
        hint: done ? 'Response complete — read full text'
            : spinner ? 'Still generating — wait and re-check'
            : lastResponse ? 'Text appeared but not complete yet'
            : 'No response yet — wait',
      };
    },

    /** Отправить сообщение в чат */
    async send(text) {
      const textarea = findElement(spec.input);
      if (!textarea) {
        return { error: 'no_input', provider: providerKey, hint: 'Textarea not found' };
      }

      // Ввести текст
      humanInput(textarea, text);
      await new Promise(r => setTimeout(r, 300)); // имитация человека

      // Отправить Enter
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      return { sent: true, provider: providerKey, textLen: text.length };
    },

    /** Прочитать последний ответ */
    read() {
      // Приоритет: network buffer → DOM
      const netTokens = window.__netBuffer?.getLatestTokens();
      if (netTokens && netTokens.length > 0) {
        return {
          text: netTokens,
          len: netTokens.length,
          source: 'network',
          provider: providerKey,
        };
      }

      // Fallback на DOM
      const responseEls = findElements(spec.response);
      const last = responseEls[responseEls.length - 1];
      const text = (last?.innerText || '').replace(/^Thought Process\n/, '').trim();
      return {
        text,
        len: text.length,
        source: 'dom',
        provider: providerKey,
      };
    },

    /** Мониторинг прогресса (для Agent Mode) */
    monitor() {
      return this.observe(); // alias — полная диагностика
    },

    /** Health-check — проверить все селекторы */
    healthCheck() {
      const results = {
        provider: providerKey,
        url: location.href,
        checks: {},
      };

      // Input
      const input = findElement(spec.input);
      results.checks.input = { ok: !!input, selector: input ? spec.input.primary : 'ALL_FAILED' };

      // Response
      const responseEls = findElements(spec.response);
      results.checks.response = { ok: responseEls.length > 0, count: responseEls.length };

      // Spinner
      results.checks.spinner = { ok: true, selector: spec.generation.spinner };

      // Network hooks
      results.checks.networkHooks = {
        ok: !!window.__netHooksInstalled,
        bufferLen: window.__netBuffer?.entries?.length || 0,
      };

      // Session
      results.checks.session = {
        ok: !!window.__session,
        loggedIn: window.__session?.status()?.loggedIn || false,
      };

      results.healthy = Object.values(results.checks).every(c => c.ok);
      return results;
    },
  };

  return {
    status: 'initialized',
    provider: providerKey,
    providerName: spec.name,
    hint: 'Use window.__adapter.observe() / .send(text) / .read() / .healthCheck()',
  };
})()
