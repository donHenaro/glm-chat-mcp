/**
 * scripts/providers/spec.js v1.0
 * PROVIDERS constant and getProviderSpec() — SINGLE SOURCE OF TRUTH for all provider specs.
 *
 * Loaded after base-adapter.js.
 * Adds: window.__providers.PROVIDERS, window.__providers.getProviderSpec
 */
(() => {
  'use strict';

  const PROVIDERS = {
    glm: {
      name: 'GLM',
      baseUrl: 'https://chat.z.ai',
      models: {
        default: 'GLM-5.1',
        available: ['GLM-5.1', 'GLM-5'],
        mostPowerful: 'GLM-5.1',
        selector: 'button.modelSelectorButton',
      },
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
      models: {
        default: 'Qwen3.7-Plus',
        available: ['Qwen3.7-Plus'],
        mostPowerful: 'Qwen3.7-Plus',
        selector: '.index-module__model-selector___rdCim',
      },
      chatPattern: '/c/',
      input: {
        primary: 'textarea.message-input-textarea',
        fallbacks: ['textarea[class*="input"]', 'textarea'],
      },
      response: {
        primary: '[class*="message-content"]',
        fallbacks: ['[class*="markdown"]', '[class*="assistant"]', '[class*="chat-message-assistant"]', '[role="article"]'],
      },
      generation: {
        spinner: '[class*="loading"]',
        stop: 'button:has-text("Stop")',
        thinking: '[class*="thinking"]',
      },
      done: {
        type: 'svg-buttons', // Qwen тоже использует SVG-иконки без текста
        minButtons: 2,
        selector: 'button svg',
      },
      modes: {
        search: '[class*="search-toggle"]',
        modelSelect: '[class*="model-select"]',
        deepThink: '[class*="thinking"]',
      },
      files: {
        input: 'input[type="file"]',
      },
    },
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://chat.deepseek.com',
      models: {
        default: 'DeepSeek-V3',
        available: ['DeepSeek-V3', 'DeepSeek-R1'],
        mostPowerful: 'DeepSeek-R1',
        selector: null, // Нет отдельного selector — R1 = DeepThink mode
        note: 'R1 активируется через mode-switcher (Глубокое мышление)',
      },
      chatPattern: '/a/chat/s/',
      sendMode: 'button', // DeepSeek: нужна кнопка отправки, Enter не работает
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
        fast: 'button:text("Быстрый режим")',
        deepThink: 'button:text("Глубокое мышление")',
        search: 'button:text("Умный поиск")',
      },
      files: {
        input: 'input[type="file"]',
      },
    },
    kimi: {
      name: 'Kimi',
      baseUrl: 'https://www.kimi.com',
      models: {
        default: 'K2.6 Instant',
        available: ['K2.6 Instant', 'K2.6 Thinking', 'K2.6 Agent'],
        mostPowerful: 'K2.6 Thinking',
        selector: null, // Переключение через popup-меню
        note: 'K2.6 Thinking = deep thinking, K2.6 Agent = research agent',
      },
      chatPattern: '/chat/',
      input: {
        type: 'contenteditable',
        primary: '.chat-input-editor',
        fallbacks: ['[contenteditable="true"][role="textbox"]'],
      },
      response: {
        primary: '[class*="markdown"]',
        fallbacks: ['[class*="message"]', '[class*="assistant"]'],
      },
      generation: {
        spinner: '[class*="loading"]',
        thinking: '[class*="thinking"]',
      },
      done: {
        type: 'text-buttons',
        copyText: 'Copy',
      },
      modes: {},
      files: {
        input: 'input[type="file"]',
      },
      // ⚠️ Kimi использует gRPC (/apiv2/kimi.chat.v1.ChatService), не REST+SSE.
      // Network hooks (fetch interception) НЕ РАБОТАЮТ — использовать DOM fallback.
      network: 'gRPC',
    },
  };

  /**
   * Get provider spec by key
   * @param {string} key - Provider key (glm, qwen, deepseek, kimi)
   * @returns {object|null}
   */
  function getProviderSpec(key) {
    return PROVIDERS[key] || null;
  }

  // Export to namespace
  window.__providers = window.__providers || {};
  window.__providers.PROVIDERS = PROVIDERS;
  window.__providers.getProviderSpec = getProviderSpec;
})()
