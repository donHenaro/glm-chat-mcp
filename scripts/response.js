/**
 * Response — единый модуль для detection + extraction + health-check
 * Объединяет detect-response.js + extract-text.js (по рекомендации GLM)
 * 
 * Fallback-цепочки селекторов (по рекомендации GLM + Qwen)
 * При срабатывании fallback — console.warn для наблюдаемости (по рекомендации Qwen)
 */

const STRATEGIES = {
  glm: [
    () => document.querySelectorAll('.markdown-prose'),
    () => document.querySelectorAll('[class*="prose"]'),
    () => document.querySelectorAll('[data-message-role="assistant"]'),
  ],
  qwen: [
    () => document.querySelectorAll('[class*="message-content"]'),
    () => document.querySelectorAll('.markdown-body'),
    () => document.querySelectorAll('[role="article"]'),
  ],
  deepseek: [
    () => document.querySelectorAll('.ds-markdown'),
    () => document.querySelectorAll('[class*="markdown"]'),
    () => document.querySelectorAll('[role="article"]'),
  ],
};

/**
 * Общая функция — переиспользуется для detection и extraction
 */
function detectResponseElements(provider) {
  const strategies = STRATEGIES[provider] || STRATEGIES.glm;
  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = strategies[i]();
      if (result.length > 0) {
        if (i > 0) {
          console.warn('[glm-chat-mcp] Primary selector failed for ' + provider + ', used fallback #' + (i + 1));
        }
        return result;
      }
    } catch (e) { /* next strategy */ }
  }
  throw new Error('All response detection strategies failed for ' + provider + ' — DOM changed?');
}

/**
 * Проверка готовности ответа GLM (SVG-based detection)
 */
function isGLMResponseDone() {
  const prose = detectResponseElements('glm');
  const last = prose[prose.length - 1];
  if (!last) return { done: false, textLen: 0 };

  const parent = last.closest('[class*="message"]') || last.parentElement?.parentElement;
  const btns = parent ? parent.querySelectorAll('button') : [];
  const actionBtns = Array.from(btns).filter(b => b.className.includes('visible') && b.querySelector('svg'));
  const spinner = !!document.querySelector('[class*="spinner"]');

  return {
    done: actionBtns.length >= 2 && !spinner,
    textLen: last.innerText.length,
    text: last.innerText,
    spinner,
  };
}

/**
 * Универсальное чтение ответа (любой провайдер)
 */
function readResponse(provider) {
  const elements = detectResponseElements(provider);
  const last = elements[elements.length - 1];
  if (!last) return '';

  const text = last.innerText || '';
  return text.replace(/^Thought Process\n/, '').trim();
}

/**
 * Прочитать последний ответ провайдера (для extract-text)
 */
function extractLastResponse(provider) {
  const text = readResponse(provider);
  return { text, len: text.length };
}

/**
 * Извлечь все ответы из чата (для checkpoint)
 */
function extractAllResponses(provider) {
  const elements = detectResponseElements(provider);
  return Array.from(elements).map((el, i) => ({
    index: i,
    len: el.innerText?.length || 0,
    preview: (el.innerText || '').slice(0, 200),
  }));
}

/**
 * Startup Health-Check — проверить все селекторы
 */
function healthCheck() {
  const results = {};
  for (const provider of Object.keys(STRATEGIES)) {
    try {
      const elements = detectResponseElements(provider);
      results[provider] = { ok: true, count: elements.length };
    } catch (e) {
      results[provider] = { ok: false, error: e.message };
    }
  }
  return results;
}

/**
 * Контекстный checkpoint (по рекомендации GLM)
 */
function formatCheckpoint(chatId, provider, knownContext) {
  return {
    chatId,
    provider,
    timestamp: new Date().toISOString(),
    knownContext: knownContext || {},
    format: 'v1',
  };
}

/**
 * Проверить, нужно ли повторять контекст (улучшенная версия по рекомендации GLM)
 */
function needsContextRepeat(checkpoint) {
  if (!checkpoint || !checkpoint.format) return true;
  // Если чат активен < 30 мин — скорее всего контекст актуален
  const age = Date.now() - new Date(checkpoint.timestamp).getTime();
  if (age < 30 * 60 * 1000) return false;
  // Если > 30 мин — модель могла забыть (context window eviction)
  return true;
}
