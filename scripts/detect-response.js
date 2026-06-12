/**
 * Response Detection — проверка готовности ответа
 * Поддерживает fallback-цепочку селекторов (по рекомендации GLM)
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

function detectResponseElements(provider) {
  const strategies = STRATEGIES[provider] || STRATEGIES.glm;
  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result.length > 0) return result;
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
  const clean = text.replace(/^Thought Process\n/, '').trim();
  return clean;
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
