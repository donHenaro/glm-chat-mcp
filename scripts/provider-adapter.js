/**
 * scripts/provider-adapter.js v16.0
 * Унифицированный провайдер-агностик API — единый интерфейс для всех чатов.
 *
 * ТОНКИЙ ОРКЕСТРАТОР:
 *   Part 1 — Загрузка провайдер-модулей (scripts/providers/*.js) → window.__providers
 *   Part 2 — DOM-level IIFE: window.__adapter с observe/send/read/monitor/healthCheck
 *
 * Модули (загружаются в window.__providers через browser_evaluate):
 *   - scripts/providers/base-adapter.js      → IProviderAdapter
 *   - scripts/providers/spec.js              → PROVIDERS, getProviderSpec
 *   - scripts/providers/glm-adapter.js       → GLMAdapter
 *   - scripts/providers/qwen-adapter.js      → OpenAIAdapter, QwenAdapter
 *   - scripts/providers/deepseek-adapter.js  → DeepSeekAdapter
 *   - scripts/providers/kimi-adapter.js      → KimiAdapter
 *   - scripts/providers/openai-normalizer.js → OpenAINormalizer
 *   - scripts/providers/index.js             → createAdapter, ADAPTER_MAP, detect, createForHost
 *
 * Вызов: browser_evaluate(filename='provider-adapter.js')
 *   (Модули должны быть загружены ДО этого файла — см. hooks-auto-init.js)
 * Затем: browser_evaluate('window.__adapter.send("prompt text")')
 *        browser_evaluate('window.__adapter.read()')
 *        browser_evaluate('window.__currentAdapter.readFromBuffer()')
 *        browser_evaluate('new OpenAINormalizer().normalizeFull()')
 */

// ============================================
// Part 1: Initialize from provider modules
// ============================================

const P = window.__providers;
if (!P) {
  console.error('[provider-adapter] window.__providers not initialized! Provider modules must be loaded first.');
}

// ============================================
// Part 2: DOM-level adapter (IIFE)
// ============================================

(() => {
  if (window.__adapter) {
    return { status: 'already_initialized', provider: window.__adapter.provider };
  }

  // Получаем спецификацию и адаптер из модулей
  const providerKey = P ? P.detect() : 'unknown';
  const spec = P ? P.getProviderSpec(providerKey) : null;

  if (!spec) {
    return { error: 'unknown_provider', host: location.hostname, hint: 'Navigate to a supported chat provider first' };
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
  function humanInput(el, text) {
    // Contenteditable (Kimi и др.)
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      el.focus();
      // Используем execCommand для совместимости с React/Vue
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // Textarea / Input
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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
      const inputEl = findElement(spec.input);
      if (!inputEl) {
        return { error: 'no_input', provider: providerKey, hint: 'Input element not found' };
      }

      // Ввести текст
      humanInput(inputEl, text);
      await new Promise(r => setTimeout(r, 300)); // имитация человека

      // Отправить — метод зависит от провайдера
      const isContenteditable = spec.input.type === 'contenteditable' || inputEl.isContentEditable;
      if (spec.sendMode === 'button') {
        // DeepSeek и подобные: нажать кнопку отправки вместо Enter
        const sendBtn = document.querySelector('.ds-button--circle.ds-button--primary, button[class*="send"]');
        if (sendBtn) sendBtn.click();
      } else if (isContenteditable) {
        // Contenteditable: Enter через keydown/keypress/keyup
        ['keydown', 'keypress', 'keyup'].forEach(type => {
          inputEl.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        });
      } else {
        // Textarea: Enter через keydown
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }

      return { sent: true, provider: providerKey, textLen: text.length, inputType: isContenteditable ? 'contenteditable' : 'textarea', sendMethod: spec.sendMode || 'enter' };
    },

    /** Прочитать последний ответ */
    read() {
      // Приоритет: adapter (network-aware) → network buffer → DOM
      if (window.__currentAdapter?.readFromBuffer) {
        const answerText = window.__currentAdapter.getAnswerText();
        if (answerText && answerText.length > 0) {
          return { text: answerText, len: answerText.length, source: 'adapter', provider: providerKey };
        }
      }

      // Fallback: network buffer
      const netTokens = window.__netBuffer?.getLatestTokens();
      if (netTokens && netTokens.length > 0) {
        return { text: netTokens, len: netTokens.length, source: 'network', provider: providerKey };
      }

      // Fallback: DOM
      const responseEls = findElements(spec.response);
      const last = responseEls[responseEls.length - 1];
      const text = (last?.innerText || '').replace(/^Thought Process\n/, '').trim();
      return { text, len: text.length, source: 'dom', provider: providerKey };
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
    sseAdapter: window.__currentAdapter?.constructor?.name || 'none',
    providerName: spec.name,
    hint: 'Use window.__adapter.observe() / .send(text) / .read() / .healthCheck() — window.__currentAdapter for SSE-level access',
  };
})()
