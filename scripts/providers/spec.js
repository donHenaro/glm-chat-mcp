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
