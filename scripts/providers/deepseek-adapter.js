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
