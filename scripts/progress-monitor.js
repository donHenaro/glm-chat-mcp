/**
 * scripts/progress-monitor.js v13.1
 * Мониторинг Agent Mode (thought + toolCalls + mainText + done + spinner)
 *
 * ИСПРАВЛЕНО: убрана зависимость от несуществующих селекторов
 *
 * Вызов: browser_evaluate(filename='progress-monitor.js')
 */
(() => {
  const SELECTORS = {
    GLM:      { text: '.markdown-prose',        thought: '[class*="thinking"]',  spinner: '[class*="spinner"]' },
    Qwen:     { text: '[class*="message-content"]', thought: '[class*="thinking"]',  spinner: '[class*="loading"]' },
    DeepSeek: { text: '.ds-markdown',            thought: '[class*="think"]',     spinner: '[class*="loading"]' }
  };

  const host = location.hostname;
  const key = host.includes('z.ai') ? 'GLM' : host.includes('qwen') ? 'Qwen' : 'DeepSeek';
  const sel = SELECTORS[key];

  // Последний текстовый элемент
  const textEls = document.querySelectorAll(sel.text);
  const lastText = textEls[textEls.length - 1];
  const mainText = lastText?.innerText || '';

  // Thought (рассуждения)
  const thoughtEls = document.querySelectorAll(sel.thought);
  const lastThought = thoughtEls[thoughtEls.length - 1];
  const thoughtText = lastThought?.innerText || '';

  // Tool calls — универсальный поиск
  const toolCallEls = document.querySelectorAll('[class*="tool"], [class*="function-call"], [class*="code-exec"]');
  const toolCalls = Array.from(toolCallEls).map(el => el.textContent?.slice(0, 100)).filter(Boolean);

  // Spinner — генерация ещё идёт
  const spinner = document.querySelector(sel.spinner) !== null;

  // Кнопки действий (Copy/Regenerate/Stop)
  const lastBubble = lastText?.closest('[class*="message"]') || lastText?.parentElement?.parentElement;
  const actionBtns = lastBubble
    ? Array.from(lastBubble.querySelectorAll('button')).filter(b => b.querySelector('svg')).length
    : 0;

  // Done = spinner нет + есть текст + есть кнопки
  const done = !spinner && mainText.length > 0 && actionBtns >= 2;

  return {
    provider: key,
    mainTextLen: mainText.length,
    mainText: mainText.slice(0, 500),
    thoughtLen: thoughtText.length,
    thought: thoughtText.slice(0, 300),
    toolCalls: toolCalls.slice(0, 5),
    toolCallCount: toolCallEls.length,
    spinner,
    actionBtns,
    done,
    // Timing hint
    hint: done ? 'Response complete — read full text' :
          spinner ? 'Still generating — wait and re-check' :
          mainText.length > 0 ? 'Text appeared but no action buttons yet' :
          'No response yet — wait'
  };
})();
