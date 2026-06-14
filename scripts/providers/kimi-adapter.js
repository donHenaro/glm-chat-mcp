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
