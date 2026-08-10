/**
 * scripts/providers-bundle.js — AUTO-GENERATED, DO NOT EDIT
 * Build: 2026-08-10T10:31:03.310Z
 * 
 * Bundle of all provider modules for browser_evaluate injection.
 * Вызов: browser_evaluate(filename='providers-bundle.js')
 */


// ═══ base-adapter.js ═══
/**
 * scripts/providers/base-adapter.js v1.0
 * IProviderAdapter — базовый интерфейс для SSE-level адаптеров.
 *
 * MUST be loaded FIRST before any other provider module.
 * Adds: window.__providers.IProviderAdapter
 */
(() => {
  'use strict';

  /**
   * IProviderAdapter — базовый интерфейс для SSE-адаптеров провайдеров.
   * Все конкретные адаптеры (GLM, Qwen, DeepSeek, Kimi) наследуют этот класс.
   */
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

  // Export to namespace
  window.__providers = window.__providers || {};
  window.__providers.IProviderAdapter = IProviderAdapter;
})()


// ═══ spec.js ═══
/**
 * scripts/providers/spec.js v2.0
 * SINGLE SOURCE OF TRUTH for all provider specs: selectors, detectProvider, API patterns, URLs.
 *
 * Exports (IIFE — loaded via browser_evaluate, no require/import):
 *   window.__spec        — unified selectors, detectProvider, API patterns, utilities
 *   window.__providers   — adapter-friendly PROVIDERS + getProviderSpec (backward compat)
 *
 * Load order: base-adapter.js → spec.js → individual adapters → openai-normalizer.js → index.js
 */
(() => {
  'use strict';

  // ==========================================
  // detectProvider — determine provider by hostname
  // ==========================================
  function detectProvider(hostname) {
    if (!hostname) hostname = location.hostname;
    if (hostname.includes('z.ai')) return 'glm';
    if (hostname.includes('qwen')) return 'qwen';
    if (hostname.includes('deepseek')) return 'deepseek';
    if (hostname.includes('kimi')) return 'kimi';
    return 'unknown';
  }

  // ==========================================
  // PROVIDER_URLS — provider → canonical URL
  // ==========================================
  const PROVIDER_URLS = {
    glm:      'chat.z.ai',
    qwen:     'chat.qwen.ai',
    deepseek: 'chat.deepseek.com',
    kimi:     'www.kimi.com',
  };

  // ==========================================
  // API_PATTERNS — URL patterns for interception
  // ==========================================
  const API_PATTERNS = {
    glm:      ['/api/v2/chat/completions', '/api/chat/', '/api/conversation/', '/completions', '/chat/'],
    qwen:     ['/api/v2/chat/completions', '/api/chat/', '/api/conversation/', '/completions'],
    deepseek: ['/api/v0/chat/completion', '/api/v0/chat/', '/api/chat/', '/completions'],
    kimi:     [], // Kimi uses gRPC, no REST SSE
  };

  // ==========================================
  // SELECTORS — all DOM selectors per provider
  // ==========================================
  const SELECTORS = {

    // --- GLM ---
    glm: {
      response: {
        primary:   '.markdown-prose',
        fallbacks: ['[class*="prose"]', '[data-message-role="assistant"]'],
      },
      input: {
        primary:   '#chat-input',
        fallbacks: ['textarea[class*="input"]', 'textarea'],
      },
      generation: {
        spinner:  '[class*="spinner"]',
        loading:  '[class*="loading"]',
        thinking: '[class*="thinking"]',
      },
      done: {
        type:      'svg-buttons',
        minButtons: 2,
        selector:  'button svg',
      },
      send: {
        button: 'button[type="submit"]',
      },
      fileUpload: 'input[type="file"]',
      login: {
        avatar:   '[class*="avatar"], [class*="user-info"], [data-testid="user-menu"]',
        notLogin: '/login',
      },
      chatOpen: '/c/',
      modes: {
        agent:     'button:text("Agent")',
        deepThink: '[data-autothink]',
        search:    'button[data-active]',
        aiPpt:     'button:text("AI PPT")',
      },
    },

    // --- Qwen ---
    qwen: {
      response: {
        primary:   '[class*="message-content"]',
        fallbacks: ['.markdown-body', '[class*="markdown"]', '[class*="assistant"]', '[class*="chat-message-assistant"]', '[role="article"]'],
      },
      input: {
        primary:   'textarea.message-input-textarea',
        fallbacks: ['textarea[class*="input"]', 'textarea'],
      },
      generation: {
        spinner:  '[class*="loading"]',
        loading:  '[class*="loading"]',
        thinking: '[class*="thinking"]',
      },
      done: {
        type:      'svg-buttons',
        minButtons: 2,
        selector:  'button svg',
      },
      send: {
        button: 'button[type="submit"]',
      },
      fileUpload: 'input[type="file"]',
      login: {
        avatar:   '[class*="avatar"], [class*="user"]',
        notLogin: '/login',
      },
      chatOpen: '/c/',
      modes: {
        search:    '[class*="search-toggle"]',
        modelSelect: '[class*="model-select"]',
        deepThink: '[class*="thinking"]',
      },
    },

    // --- DeepSeek ---
    deepseek: {
      response: {
        primary:   '.ds-markdown',
        fallbacks: ['[class*="markdown"]', '[role="article"]'],
      },
      input: {
        primary:   'textarea',
        fallbacks: ['textarea[class*="input"]'],
      },
      generation: {
        spinner:  '[class*="loading"]',
        loading:  '[class*="loading"]',
        thinking: '[class*="think"]',
      },
      done: {
        type:          'text-buttons',
        copyText:      'Copy',
        regenerateText: 'Regenerate',
      },
      send: {
        button: 'button[type="submit"]', // DeepSeek: button click required, Enter doesn't work
      },
      fileUpload: 'input[type="file"]',
      login: {
        avatar:   '[class*="avatar"], [class*="user"]',
        notLogin: '/login',
      },
      chatOpen: '/a/chat/s/',
      modes: {
        fast:      'button:text("Быстрый режим")',
        deepThink: 'button:text("Глубокое мышление")',
        search:    'button:text("Умный поиск")',
      },
    },

    // --- Kimi ---
    kimi: {
      response: {
        primary:   '[class*="markdown"]',
        fallbacks: ['[class*="message"]', '[class*="assistant"]'],
      },
      input: {
        type:      'contenteditable',
        primary:   '.chat-input-editor',
        fallbacks: ['[contenteditable="true"][role="textbox"]'],
      },
      generation: {
        spinner:  '[class*="loading"]',
        loading:  '[class*="loading"]',
        thinking: '[class*="thinking"]',
      },
      done: {
        type:      'text-buttons',
        copyText:  'Copy',
      },
      send: {
        button: 'button[type="submit"]',
      },
      fileUpload: 'input[type="file"]',
      login: {
        avatar:   '[class*="avatar"], [class*="user"]',
        notLogin: '/login',
      },
      chatOpen: '/chat/',
      network:  'gRPC', // Kimi uses gRPC, not REST+SSE
    },
  };

  // ==========================================
  // parseSSETokens — shared SSE token parser
  // ==========================================
  function parseSSETokens(text) {
    const tokens = [];
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') break;
      try {
        const json = JSON.parse(data);
        // GLM-specific: {type:"chat:completion", data:{delta_content:"...", phase:"thinking|answer"}}
        const glmContent = json?.data?.delta_content;
        if (glmContent) {
          tokens.push({ text: glmContent, phase: json?.data?.phase || json?.phase || 'answer' });
          continue;
        }
        // OpenAI-compatible: choices[0].delta.content
        const openaiContent = json?.choices?.[0]?.delta?.content
                           || json?.choices?.[0]?.message?.content
                           || json?.data?.content
                           || json?.content
                           || '';
        if (openaiContent) tokens.push({ text: openaiContent, phase: 'answer' });
      } catch {
        if (data) tokens.push({ text: data, phase: 'unknown' });
      }
    }
    return tokens;
  }

  // ==========================================
  // Helper: build response strategies from SELECTORS
  // Returns array of query functions (used by ai-extract.js, multi-collect.js)
  // ==========================================
  function getResponseStrategies(provider) {
    const sels = SELECTORS[provider] || SELECTORS.glm;
    const all = [sels.response.primary, ...sels.response.fallbacks];
    return all.map(sel => () => document.querySelectorAll(sel));
  }

  // ==========================================
  // Export to window.__spec
  // ==========================================
  window.__spec = {
    detectProvider,
    PROVIDER_URLS,
    API_PATTERNS,
    SELECTORS,
    parseSSETokens,
    getResponseStrategies,
  };

  // ==========================================
  // Also export to window.__providers (backward compat for adapter system)
  // ==========================================
  const PROVIDERS = {
    glm: {
      name: 'GLM',
      baseUrl: 'https://chat.z.ai',
      chatPattern: '/c/',
    },
    qwen: {
      name: 'Qwen',
      baseUrl: 'https://chat.qwen.ai',
      chatPattern: '/c/',
    },
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://chat.deepseek.com',
      chatPattern: '/a/chat/s/',
      sendMode: 'button',
    },
    kimi: {
      name: 'Kimi',
      baseUrl: 'https://www.kimi.com',
      chatPattern: '/chat/',
      network: 'gRPC',
    },
  };

  window.__providers = window.__providers || {};
  window.__providers.PROVIDERS = PROVIDERS;
  window.__providers.getProviderSpec = (key) => PROVIDERS[key] || null;
})()


// ═══ glm-adapter.js ═══
/**
 * scripts/providers/glm-adapter.js v1.0
 * GLMAdapter — адаптер для ChatGLM (chat.z.ai).
 *
 * API: /api/v2/chat/completions
 * Формат: {type:"chat:completion", data:{delta_content, phase:"thinking"|"answer"}}
 *
 * Depends on: base-adapter.js (window.__providers.IProviderAdapter)
 * Adds: window.__providers.GLMAdapter
 */
(() => {
  'use strict';

  const IProviderAdapter = window.__providers.IProviderAdapter;

  /**
   * GLMAdapter — адаптер для ChatGLM
   */
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

  // Export to namespace
  window.__providers = window.__providers || {};
  window.__providers.GLMAdapter = GLMAdapter;
})()


// ═══ qwen-adapter.js ═══
/**
 * scripts/providers/qwen-adapter.js v1.0
 * QwenAdapter — адаптер для Qwen (chat.qwen.ai).
 *
 * SSE формат: {choices:[{delta:{content:"..."}}]} или {output: {text: "...", finish_reason: null}}
 *
 * Depends on: base-adapter.js, glm-adapter.js (OpenAIAdapter is in glm-adapter.js for now,
 *   but QwenAdapter extends OpenAIAdapter which is defined inline below as it was in the original)
 * Actually: OpenAIAdapter is a base for Qwen/DeepSeek/Kimi. We need it accessible.
 * Since QwenAdapter extends OpenAIAdapter, we define OpenAIAdapter here too
 * or rely on it being in the namespace. Let's check — OpenAIAdapter is not in its own file.
 * We'll define OpenAIAdapter as a shared base here and re-export from glm-adapter.
 *
 * Actually, re-reading the original: OpenAIAdapter is defined inline in provider-adapter.js
 * between GLMAdapter and QwenAdapter. It's not a separate adapter per the task spec
 * (only glm/qwen/deepseek/kimi). But Qwen/DeepSeek/Kimi all extend it.
 * So we define OpenAIAdapter as part of the qwen module since it's the OpenAI-compatible base.
 *
 * Depends on: base-adapter.js (window.__providers.IProviderAdapter)
 * Adds: window.__providers.OpenAIAdapter, window.__providers.QwenAdapter
 */
(() => {
  'use strict';

  const IProviderAdapter = window.__providers.IProviderAdapter;

  /**
   * OpenAIAdapter — адаптер для OpenAI-совместимых API (DeepSeek, Qwen)
   * Формат: {choices:[{delta:{content:"..."}}]}
   */
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

  /**
   * QwenAdapter — адаптер для Qwen (chat.qwen.ai)
   * SSE формат: {choices:[{delta:{content:"..."}}]} или {output: {text: "...", finish_reason: null}}
   */
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

  // Export to namespace
  window.__providers = window.__providers || {};
  window.__providers.OpenAIAdapter = OpenAIAdapter;
  window.__providers.QwenAdapter = QwenAdapter;
})()


// ═══ deepseek-adapter.js ═══
/**
 * scripts/providers/deepseek-adapter.js v1.0
 * DeepSeekAdapter — адаптер для DeepSeek (chat.deepseek.com).
 *
 * SSE формат: {choices:[{delta:{content/reasoning_content:"..."}}]}
 * API: /api/v0/chat/completion (подтверждено тестами)
 * DeepSeek использует reasoning_content для цепочки рассуждений
 * ⚠️ Network hooks НЕ работают: DeepSeek SPA кэширует fetch в замыкании.
 *    Использовать DOM-чтение (.ds-markdown) или page.route() через Playwright.
 *
 * Depends on: base-adapter.js, qwen-adapter.js (window.__providers.OpenAIAdapter)
 * Adds: window.__providers.DeepSeekAdapter
 */
(() => {
  'use strict';

  const OpenAIAdapter = window.__providers.OpenAIAdapter;

  /**
   * DeepSeekAdapter — адаптер для DeepSeek
   * DeepSeek совместим с OpenAI SSE format
   * Но fetch перехват не работает — использовать DOM fallback
   */
  class DeepSeekAdapter extends OpenAIAdapter {
    // DeepSeek-специфичные DOM селекторы (подтверждены тестами 2026-06-14)
    static SELECTORS = {
      input: 'textarea',
      response: '.ds-markdown',
      spinner: '[class*="loading"]',
      done: { type: 'text-buttons', copyText: 'Copy' },
    };
  }

  // Export to namespace
  window.__providers = window.__providers || {};
  window.__providers.DeepSeekAdapter = DeepSeekAdapter;
})()


// ═══ kimi-adapter.js ═══
/**
 * scripts/providers/kimi-adapter.js v1.0
 * KimiAdapter — адаптер для Kimi (kimi.com).
 *
 * API: gRPC (/apiv2/kimi.chat.v1.ChatService) — НЕ REST+SSE!
 * Network hooks не работают — использовать DOM fallback.
 * Ввод: contenteditable (.chat-input-editor), не textarea
 *
 * Depends on: base-adapter.js, qwen-adapter.js (window.__providers.OpenAIAdapter)
 * Adds: window.__providers.KimiAdapter
 */
(() => {
  'use strict';

  const OpenAIAdapter = window.__providers.OpenAIAdapter;

  /**
   * KimiAdapter — адаптер для Kimi
   * Kimi использует gRPC, но DOM-чтение работает
   */
  class KimiAdapter extends OpenAIAdapter {
    static SELECTORS = {
      input: '.chat-input-editor',
      inputType: 'contenteditable',
      response: '[class*="markdown"]',
      spinner: '[class*="loading"]',
      done: { type: 'text-buttons', copyText: 'Copy' },
    };
  }

  // Export to namespace
  window.__providers = window.__providers || {};
  window.__providers.KimiAdapter = KimiAdapter;
})()


// ═══ openai-normalizer.js ═══
/**
 * scripts/providers/openai-normalizer.js v1.0
 * OpenAINormalizer — транслятор GLM→OpenAI SSE.
 *
 * Вход: GLM SSE {type:chat:completion, data:{delta_content, phase}}
 * Выход: OpenAI SSE {choices:[{delta:{content/reasoning_content}}]}
 *
 * Depends on: glm-adapter.js (window.__providers.GLMAdapter)
 * Adds: window.__providers.OpenAINormalizer
 */
(() => {
  'use strict';

  const GLMAdapter = window.__providers.GLMAdapter;

  /**
   * OpenAINormalizer — транслятор GLM→OpenAI SSE
   */
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

  // Export to namespace
  window.__providers = window.__providers || {};
  window.__providers.OpenAINormalizer = OpenAINormalizer;
})()


// ═══ index.js ═══
/**
 * scripts/providers/index.js v15.3
 * Factory and registry — createAdapter(name), ADAPTER_MAP, detect(), createForHost().
 * Re-exports everything from window.__providers namespace.
 *
 * v15.3: detect() делегирован в spec.js (window.__spec.detectProvider)
 *
 * MUST be loaded LAST (after base-adapter.js, spec.js, all adapters, openai-normalizer.js).
 * Adds: window.__providers.createAdapter, window.__providers.ADAPTER_MAP,
 *       window.__providers.detect, window.__providers.createForHost
 */
(() => {
  'use strict';

  const P = window.__providers;

  // === ADAPTER_MAP — factory functions for each provider ===
  const ADAPTER_MAP = {
    glm: () => new P.GLMAdapter(),
    qwen: () => new P.QwenAdapter(),
    deepseek: () => new P.DeepSeekAdapter(),
    kimi: () => new P.KimiAdapter(),
  };

  /**
   * Create an adapter by provider name
   * @param {string} name - Provider key (glm, qwen, deepseek, kimi)
   * @returns {IProviderAdapter}
   */
  function createAdapter(name) {
    const factory = ADAPTER_MAP[name];
    if (!factory) {
      throw new Error(`[providers] Unknown adapter: "${name}". Available: ${Object.keys(ADAPTER_MAP).join(', ')}`);
    }
    return factory();
  }

  /**
   * Detect provider from hostname (delegated to spec.js)
   * @param {string} hostname - location.hostname
   * @returns {string} Provider key
   */
  function detect(hostname) {
    return window.__spec.detectProvider(hostname);
  }

  /**
   * Create adapter for current host
   * @returns {IProviderAdapter}
   */
  function createForHost() {
    const providerKey = detect();
    return ADAPTER_MAP[providerKey]?.() || new P.OpenAIAdapter();
  }

  // === Re-export everything to namespace ===
  P.ADAPTER_MAP = ADAPTER_MAP;
  P.createAdapter = createAdapter;
  P.detect = detect;
  P.createForHost = createForHost;

  // Convenience: also set window-level globals for backward compatibility
  window.IProviderAdapter = P.IProviderAdapter;
  window.GLMAdapter = P.GLMAdapter;
  window.OpenAIAdapter = P.OpenAIAdapter;
  window.QwenAdapter = P.QwenAdapter;
  window.DeepSeekAdapter = P.DeepSeekAdapter;
  window.KimiAdapter = P.KimiAdapter;
  window.OpenAINormalizer = P.OpenAINormalizer;
  window.ADAPTER_MAP = ADAPTER_MAP;

  // Set current adapter
  window.__currentAdapter = createForHost();

  console.log('[providers] Initialized. Available:', Object.keys(ADAPTER_MAP).join(', '),
    '| Current:', window.__currentAdapter.constructor.name);
})()


// === Bundle complete ===
