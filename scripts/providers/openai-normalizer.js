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
