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
