/**
 * Multi-Provider — параллельный опрос нескольких провайдеров
 * 
 * Ключевая оптимизация (по рекомендации GLM):
 * Отправлять вопросы БЫСТРО (без await генерации), потом собирать ответы последовательно.
 * Провайдеры генерируют ответы параллельно на серверах — нужно только не блокировать отправку.
 */

/**
 * Отправить вопрос всем провайдерам (быстро, без ожидания)
 * @param {Object} providers — { glm: tab, qwen: tab, deepseek: tab }
 * @param {string} question — текст вопроса
 * @returns {Object} — { glm: boolean, qwen: boolean, deepseek: boolean } — статус отправки
 */
async function dispatchToAll(providers, question) {
  const results = {};

  for (const [name, tab] of Object.entries(providers)) {
    if (!tab) { results[name] = false; continue; }

    try {
      await tab.bringToFront();
      await tab.waitForTimeout(500);

      let input;
      if (name === 'glm') {
        input = await tab.$('#chat-input');
      } else if (name === 'qwen') {
        input = await tab.$('textarea.message-input-textarea');
      } else if (name === 'deepseek') {
        input = await tab.$('textarea');
      }

      if (input) {
        await input.fill(question);
        await input.press('Enter');
        results[name] = true;
      } else {
        results[name] = false;
      }
    } catch (e) {
      results[name] = false;
    }

    // Минимум 2 сек между отправками (rate limiting)
    await tab.waitForTimeout(2000);
  }

  return results;
}

/**
 * Собрать ответы от всех провайдеров (последовательно)
 * @param {Object} providers — { glm: tab, qwen: tab, deepseek: tab }
 * @returns {Object} — { glm: {text, len}, qwen: {text, len}, deepseek: {text, len} }
 */
function collectResponses(providers) {
  const results = {};

  const selectors = {
    glm: '.markdown-prose',
    qwen: '[class*="message-content"]',
    deepseek: '.ds-markdown',
  };

  for (const [name, tab] of Object.entries(providers)) {
    if (!tab) { results[name] = { text: '', len: 0, error: 'no tab' }; continue; }

    try {
      const sel = selectors[name] || '.markdown-prose';
      const elements = document.querySelectorAll(sel);
      const last = elements[elements.length - 1];
      const text = last?.innerText || '';
      results[name] = { text, len: text.length };
    } catch (e) {
      results[name] = { text: '', len: 0, error: e.message };
    }
  }

  return results;
}

/**
 * Формат промпта для мульти-консультации
 */
function formatMultiPrompt(question, round, otherAnswers) {
  if (round === 1) {
    return `[Мульти-консультация] ${question}\nЕсли не уверен — укажи уровень уверенности.`;
  }

  let prompt = `[Мульти-консультация — Раунд ${round}]\n`;
  prompt += `Другие эксперты ответили:\n`;
  for (const [name, answer] of Object.entries(otherAnswers)) {
    prompt += `- ${name}: ${answer.slice(0, 200)}\n`;
  }
  prompt += `\nПрокомментируй позицию других. Изменишь ли своё мнение?`;
  return prompt;
}
