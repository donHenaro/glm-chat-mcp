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
