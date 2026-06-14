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
