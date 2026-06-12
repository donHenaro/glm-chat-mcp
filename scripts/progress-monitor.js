/**
 * Progress Monitor — чтение хода Agent Mode / Deep Think
 */

function monitorProgress(provider) {
  const thought = document.querySelector('[class*="thinking"]')?.innerText || '';
  const toolCalls = document.querySelectorAll('[class*="tool-call"]');

  // Чтение основного текста ответа
  let mainText = '';
  let textLen = 0;
  try {
    const elements = document.querySelectorAll('.markdown-prose');
    const last = elements[elements.length - 1];
    mainText = last?.innerText || '';
    textLen = mainText.length;
  } catch (e) { /* fallback */ }

  // Проверка готовности (GLM: SVG buttons, другие: Copy text)
  let done = false;
  if (provider === 'glm') {
    const prose = document.querySelectorAll('.markdown-prose');
    const last = prose[prose.length - 1];
    const parent = last?.closest('[class*="message"]') || last?.parentElement?.parentElement;
    const btns = parent ? parent.querySelectorAll('button') : [];
    const actionBtns = Array.from(btns).filter(b => b.className.includes('visible') && b.querySelector('svg'));
    done = actionBtns.length >= 2;
  } else {
    // Fallback для не-GLM: искать кнопку с текстом Copy
    const copyBtns = Array.from(document.querySelectorAll('button')).filter(b => (b.textContent || '').trim() === 'Copy');
    done = copyBtns.length > 0;
  }

  const spinner = !!document.querySelector('[class*="spinner"]');

  return {
    thought: thought.slice(0, 500),
    tools: toolCalls.length,
    textLen,
    mainText: mainText.slice(0, 1000),
    done,
    spinner,
  };
}
