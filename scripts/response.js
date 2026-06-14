/**
 * Response v14.0 — Unified response detection + extraction + health-check
 * Объединяет detect-response.js + extract-text.js (по рекомендации GLM)
 *
 * v14.0: Добавлен network buffer как приоритетный источник данных
 * перед DOM-селекторами. Вдохновлено: page.route() + Chat2API SSE-streaming
 *
 * Иерархия источников данных:
 * 1. Network buffer (network-hooks.js) — SSE-ответы на уровне HTTP
 * 2. DOM-селекторы с fallback-цепочками — проверенный подход
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

  // Проверяем network buffer — если есть завершённый SSE-ответ, это надёжнее
  const netLatest = window.__netBuffer?.getLatest();
  const netDone = netLatest && !netLatest.error && netLatest.sseTokens?.length > 0;

  return {
    done: (actionBtns.length >= 2 && !spinner) || netDone,
    textLen: last.innerText.length,
    text: last.innerText,
    spinner,
    source: netDone ? 'network' : 'dom',
  };
}

/**
 * Универсальное чтение ответа (любой провайдер)
 * Приоритет: network buffer → DOM
 */
function readResponse(provider) {
  // Приоритет 1: network buffer (если установлен network-hooks.js)
  const netTokens = window.__netBuffer?.getLatestTokens();
  if (netTokens && netTokens.length > 0) {
    return netTokens.replace(/^Thought Process\n/, '').trim();
  }

  // Приоритет 2: DOM-селекторы
  const elements = detectResponseElements(provider);
  const last = elements[elements.length - 1];
  if (!last) return '';

  const text = last.innerText || '';
  return text.replace(/^Thought Process\n/, '').trim();
}

/**
 * Прочитать последний ответ провайдера (для extract-text)
 * Возвращает текст + источник (network/dom)
 */
function extractLastResponse(provider) {
  // Приоритет 1: network buffer
  const netTokens = window.__netBuffer?.getLatestTokens();
  if (netTokens && netTokens.length > 0) {
    const text = netTokens.replace(/^Thought Process\n/, '').trim();
    return { text, len: text.length, source: 'network' };
  }

  // Приоритет 2: DOM
  const text = readResponse(provider);
  return { text, len: text.length, source: 'dom' };
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
 * Startup Health-Check — проверить все селекторы + network hooks
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

  // Проверяем network hooks
  results._network = {
    installed: !!window.__netHooksInstalled,
    bufferLen: window.__netBuffer?.entries?.length || 0,
  };

  // Проверяем session manager
  results._session = {
    installed: !!window.__session,
  };

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
    format: 'v2',
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
