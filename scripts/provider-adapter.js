/**
 * scripts/provider-adapter.js v15.0
 * Унифицированный провайдер-агностик API — единый интерфейс для всех чатов.
 *
 * Содержит:
 *   Part 1 — SSE-level классы (IProviderAdapter, GLMAdapter, OpenAIAdapter, QwenAdapter, DeepSeekAdapter, OpenAINormalizer)
 *   Part 2 — Автоопределение провайдера, window.__currentAdapter через ADAPTER_MAP
 *   Part 3 — DOM-level IIFE: window.__adapter с observe/send/read/monitor/healthCheck
 *
 * Вызов: browser_evaluate(filename='provider-adapter.js')
 * Затем: browser_evaluate('window.__adapter.send("prompt text")')
 *        browser_evaluate('window.__adapter.read()')
 *        browser_evaluate('window.__currentAdapter.readFromBuffer()')
 *        browser_evaluate('new OpenAINormalizer().normalizeFull()')
 */

// ============================================
// Part 1: SSE-level adapter classes
// ============================================

// --- IProviderAdapter — базовый интерфейс ---
class IProviderAdapter {
  /** Парсит сырой SSE-чанк */
  parseSSE(rawChunk) { throw new Error('Not implemented'); }
  /** Извлекает текст из распарсенного чанка */
  extractContent(parsedChunk) { throw new Error('Not implemented'); }
  /** Проверяет завершение стрима */
  isDone(parsedChunk) { throw new Error('Not implemented'); }
  /** Определяет фазу генерации */
  getPhase(parsedChunk) { throw new Error('Not implemented'); }
}

// --- GLMAdapter — адаптер для ChatGLM ---
// API: /api/v2/chat/completions
// Формат: {type:"chat:completion", data:{delta_content, phase:"thinking"|"answer"}}
class GLMAdapter extends IProviderAdapter {
  /**
   * Парсит сырую строку SSE или объект
   * @param {string|object} rawChunk
   * @returns {object|null}
   */
  parseSSE(rawChunk) {
    if (!rawChunk) return null;

    // Если уже объект (из __netBuffer)
    if (typeof rawChunk === 'object') return rawChunk;

    // Если строка
    const trimmed = rawChunk.trim();
    if (trimmed === '[DONE]') return { __done: true };

    try {
      return JSON.parse(trimmed);
    } catch {
      // В SSE бывают префиксы "data: "
      const cleanStr = trimmed.replace(/^data:\s*/, '');
      if (cleanStr === '[DONE]') return { __done: true };
      try {
        return JSON.parse(cleanStr);
      } catch {
        console.warn('[GLMAdapter] Failed to parse SSE chunk:', trimmed.slice(0, 100));
        return null;
      }
    }
  }

  /** Извлекает текст из GLM-чанка */
  extractContent(parsedChunk) {
    if (!parsedChunk || parsedChunk.__done) return '';
    return parsedChunk?.data?.delta_content || '';
  }

  /** Проверяет завершение стрима */
  isDone(parsedChunk) {
    if (!parsedChunk) return false;
    return parsedChunk.__done === true || parsedChunk?.data?.phase === 'done';
  }

  /** Определяет фазу генерации */
  getPhase(parsedChunk) {
    if (!parsedChunk || parsedChunk.__done) return 'done';
    return parsedChunk?.data?.phase || 'unknown';
  }

  /**
   * Читает данные из window.__netBuffer и возвращает массив распарсенных чанков
   * @returns {Array<{text, phase, done}>}
   */
  readFromBuffer() {
    const latest = window.__netBuffer?.getLatest();
    if (!latest?.sseTokens?.length) return [];

    return latest.sseTokens.map(token => {
      if (typeof token === 'object') {
        return { text: token.text || '', phase: token.phase || 'unknown', done: false };
      }
      return { text: token, phase: 'unknown', done: false };
    });
  }

  /**
   * Собрать полный ответ из буфера (только answer-фаза)
   * @returns {string}
   */
  getAnswerText() {
    const chunks = this.readFromBuffer();
    return chunks
      .filter(c => c.phase === 'answer')
      .map(c => c.text)
      .join('');
  }

  /**
   * Собрать полный thinking из буфера
   * @returns {string}
   */
  getThinkingText() {
    const chunks = this.readFromBuffer();
    return chunks
      .filter(c => c.phase === 'thinking')
      .map(c => c.text)
      .join('');
  }
}

// --- OpenAIAdapter — адаптер для OpenAI-совместимых API (DeepSeek, Qwen) ---
// Формат: {choices:[{delta:{content:"..."}}]}
class OpenAIAdapter extends IProviderAdapter {
  parseSSE(rawChunk) {
    if (!rawChunk) return null;
    if (typeof rawChunk === 'object') return rawChunk;
    const trimmed = rawChunk.trim();
    if (trimmed === '[DONE]') return { __done: true };
    try {
      return JSON.parse(trimmed);
    } catch {
      const cleanStr = trimmed.replace(/^data:\s*/, '');
      if (cleanStr === '[DONE]') return { __done: true };
      try { return JSON.parse(cleanStr); } catch { return null; }
    }
  }

  extractContent(parsedChunk) {
    if (!parsedChunk || parsedChunk.__done) return '';
    return parsedChunk?.choices?.[0]?.delta?.content
        || parsedChunk?.choices?.[0]?.delta?.reasoning_content
        || '';
  }

  isDone(parsedChunk) {
    if (!parsedChunk) return false;
    return parsedChunk.__done === true
        || parsedChunk?.choices?.[0]?.finish_reason === 'stop';
  }

  getPhase(parsedChunk) {
    if (!parsedChunk || parsedChunk.__done) return 'done';
    const delta = parsedChunk?.choices?.[0]?.delta;
    if (delta?.reasoning_content) return 'thinking';
    if (delta?.content) return 'answer';
    return 'unknown';
  }
}

// --- QwenAdapter — адаптер для Qwen (chat.qwen.ai) ---
// SSE формат: {choices:[{delta:{content:"..."}}]} или {output: {text: "...", finish_reason: null}}
class QwenAdapter extends OpenAIAdapter {
  parseSSE(rawChunk) {
    const parsed = super.parseSSE(rawChunk);
    if (!parsed || parsed.__done) return parsed;
    // Qwen может использовать format: {output:{text, finish_reason}}
    if (parsed?.output?.text && !parsed?.choices) {
      return { choices: [{ delta: { content: parsed.output.text }, finish_reason: parsed.output.finish_reason || null }] };
    }
    return parsed;
  }

  // Qwen-специфичные DOM селекторы
  static SELECTORS = {
    input: 'textarea.message-input-textarea',
    response: '[class*="message-content"]',
    spinner: '[class*="loading"]',
    done: { type: 'text-buttons', copyText: 'Copy' },
  };
}

// --- DeepSeekAdapter — адаптер для DeepSeek (chat.deepseek.com) ---
// SSE формат: {choices:[{delta:{content/reasoning_content:"..."}}]}
// DeepSeek использует reasoning_content для цепочки рассуждений
class DeepSeekAdapter extends OpenAIAdapter {
  // DeepSeek уже совместим с OpenAI SSE format
  // Но использует reasoning_content для thinking

  // DeepSeek-специфичные DOM селекторы
  static SELECTORS = {
    input: 'textarea',
    response: '.ds-markdown',
    spinner: '[class*="loading"]',
    done: { type: 'text-buttons', copyText: 'Copy' },
  };
}

// --- OpenAINormalizer — транслятор GLM→OpenAI SSE ---
// Вход: GLM SSE {type:chat:completion, data:{delta_content, phase}}
// Выход: OpenAI SSE {choices:[{delta:{content/reasoning_content}}]}
class OpenAINormalizer {
  constructor(modelName = 'glm-5.1') {
    this.model = modelName;
    this.chatId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.isFirstChunk = true;
    this.chunks = [];
  }

  /**
   * Конвертирует один GLM-чанк в формат OpenAI SSE
   * @param {object} parsedChunk - от GLMAdapter.parseSSE()
   * @param {string} phase - от GLMAdapter.getPhase()
   * @returns {string|null} Строка "data: {...}\n\n" или null
   */
  normalize(parsedChunk, phase) {
    // Завершение стрима
    if (!parsedChunk || parsedChunk.__done || phase === 'done') {
      const finalChunk = {
        id: this.chatId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: this.model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      };
      return `data: ${JSON.stringify(finalChunk)}\n\ndata: [DONE]\n\n`;
    }

    const content = parsedChunk?.data?.delta_content || '';
    if (!content && !this.isFirstChunk) return null;

    const delta = {};

    // Первый чанк — роль assistant
    if (this.isFirstChunk) {
      delta.role = 'assistant';
      this.isFirstChunk = false;
    }

    // Маппинг фаз: thinking → reasoning_content, answer → content
    if (phase === 'thinking') {
      delta.reasoning_content = content;
    } else {
      delta.content = content;
    }

    const openAIChunk = {
      id: this.chatId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: null }]
    };

    this.chunks.push(openAIChunk);
    return `data: ${JSON.stringify(openAIChunk)}\n\n`;
  }

  /**
   * Нормализовать полный ответ из __netBuffer в OpenAI SSE stream
   * @returns {string} Полный OpenAI SSE стрим
   */
  normalizeFull() {
    const adapter = new GLMAdapter();
    const bufferChunks = adapter.readFromBuffer();

    if (!bufferChunks.length) return '';

    // Сброс состояния
    this.isFirstChunk = true;
    this.chunks = [];

    let output = '';
    for (const chunk of bufferChunks) {
      // Восстанавливаем формат для parseSSE
      const fakeParsed = {
        data: { delta_content: chunk.text, phase: chunk.phase }
      };
      const normalized = this.normalize(fakeParsed, chunk.phase);
      if (normalized) output += normalized;
    }

    // Финальный чанк
    output += this.normalize({ __done: true }, 'done');

    return output;
  }

  /**
   * Получить итоговый ответ как OpenAI chat.completion (не-streaming)
   * @returns {object} OpenAI-совместимый объект
   */
  toCompletionResponse() {
    const adapter = new GLMAdapter();
    const answerText = adapter.getAnswerText();
    const thinkingText = adapter.getThinkingText();

    return {
      id: this.chatId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: answerText,
          ...(thinkingText ? { reasoning_content: thinkingText } : {})
        },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 0, completion_tokens: answerText.length, total_tokens: answerText.length }
    };
  }
}

// === Экспорт SSE-классов в глобальную область видимости ===
window.IProviderAdapter = IProviderAdapter;
window.GLMAdapter = GLMAdapter;
window.OpenAIAdapter = OpenAIAdapter;
window.QwenAdapter = QwenAdapter;
window.DeepSeekAdapter = DeepSeekAdapter;
window.OpenAINormalizer = OpenAINormalizer;

// ============================================
// Part 2: Auto-detect provider, create window.__currentAdapter
// ============================================

const host = location.hostname;
const providerKey = host.includes('z.ai') ? 'glm'
                  : host.includes('qwen') ? 'qwen'
                  : host.includes('deepseek') ? 'deepseek'
                  : 'unknown';

const ADAPTER_MAP = {
  glm: () => new GLMAdapter(),
  qwen: () => new QwenAdapter(),
  deepseek: () => new DeepSeekAdapter(),
};
window.ADAPTER_MAP = ADAPTER_MAP;
window.__currentAdapter = ADAPTER_MAP[providerKey]?.() || new OpenAIAdapter();

// ============================================
// Part 3: DOM-level adapter (IIFE)
// ============================================

(() => {
  if (window.__adapter) {
    return { status: 'already_initialized', provider: window.__adapter.provider };
  }

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
    sseAdapter: window.__currentAdapter.constructor.name,
    providerName: spec.name,
    hint: 'Use window.__adapter.observe() / .send(text) / .read() / .healthCheck() — window.__currentAdapter for SSE-level access',
  };
})()
