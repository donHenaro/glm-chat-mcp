/**
 * Extract Text — универсальное чтение ответа из чата
 * + Контекстный checkpoint формат
 */

/**
 * Прочитать последний ответ провайдера
 */
function extractLastResponse(provider) {
  const selectors = {
    glm: '.markdown-prose',
    qwen: '[class*="message-content"]',
    deepseek: '.ds-markdown',
  };

  const sel = selectors[provider] || selectors.glm;
  const elements = document.querySelectorAll(sel);
  const last = elements[elements.length - 1];

  if (!last) return { text: '', len: 0 };

  const text = last.innerText || '';
  const clean = text.replace(/^Thought Process\n/, '').trim();

  return { text: clean, len: clean.length };
}

/**
 * Извлечь все ответы из чата (для checkpoint)
 */
function extractAllResponses(provider) {
  const selectors = {
    glm: '.markdown-prose',
    qwen: '[class*="message-content"]',
    deepseek: '.ds-markdown',
  };

  const sel = selectors[provider] || selectors.glm;
  const elements = document.querySelectorAll(sel);

  return Array.from(elements).map((el, i) => ({
    index: i,
    len: el.innerText?.length || 0,
    preview: (el.innerText || '').slice(0, 200),
    role: i % 2 === 0 ? 'user' : 'assistant', // Approximate
  }));
}

/**
 * Формат контекстного checkpoint (по рекомендации GLM)
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
 * Проверить, нужно ли повторять контекст
 */
function needsContextRepeat(checkpoint, newQuestion) {
  if (!checkpoint || !checkpoint.knownContext) return true;

  const known = checkpoint.knownContext;
  // Если проект или модуль изменились — нужно повторить
  if (newQuestion.includes(known.project || '___') === false) return true;

  return false;
}
