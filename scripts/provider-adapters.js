/**
 * scripts/provider-adapters.js v14.0
 * IProviderAdapter + GLMAdapter + OpenAINormalizer
 *
 * По дизайну GLM (чат chat.z.ai/c/37627b64-a932-48f6-a665-c6d35440b480)
 * Адаптировано под нашу архитектуру (browser_evaluate, window.__netBuffer)
 *
 * Вызов: browser_evaluate(filename='provider-adapters.js')
 * Затем: browser_evaluate('new GLMAdapter().readFromBuffer()')
 *        browser_evaluate('new OpenAINormalizer().normalizeFull()')
 */

// ============================================
// IProviderAdapter — базовый интерфейс
// ============================================
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

// ============================================
// GLMAdapter — адаптер для ChatGLM
// API: /api/v2/chat/completions
// Формат: {type:"chat:completion", data:{delta_content, phase:"thinking"|"answer"}}
// ============================================
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

// ============================================
// OpenAIAdapter — адаптер для OpenAI-совместимых API (DeepSeek, Qwen)
// Формат: {choices:[{delta:{content:"..."}}]}
// ============================================
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

// ============================================
// OpenAINormalizer — транслятор GLM→OpenAI SSE
// Вход: GLM SSE {type:chat:completion, data:{delta_content, phase}}
// Выход: OpenAI SSE {choices:[{delta:{content/reasoning_content}}]}
// ============================================
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

// === Экспорт в глобальную область видимости ===
window.IProviderAdapter = IProviderAdapter;
window.GLMAdapter = GLMAdapter;
window.OpenAIAdapter = OpenAIAdapter;
window.OpenAINormalizer = OpenAINormalizer;

// Автоопределение провайдера и создание адаптера
const host = location.hostname;
const providerKey = host.includes('z.ai') ? 'glm'
                  : host.includes('qwen') ? 'qwen'
                  : host.includes('deepseek') ? 'deepseek'
                  : 'unknown';

window.__currentAdapter = providerKey === 'glm' ? new GLMAdapter() : new OpenAIAdapter();

({
  status: 'initialized',
  provider: providerKey,
  adapter: window.__currentAdapter.constructor.name,
  classes: ['IProviderAdapter', 'GLMAdapter', 'OpenAIAdapter', 'OpenAINormalizer'],
  hint: 'Use: window.__currentAdapter.readFromBuffer() / new OpenAINormalizer().normalizeFull()',
})
