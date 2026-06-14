/**
 * scripts/progress-monitor.js v14.0
 * Мониторинг Agent Mode + network-aware streaming progress
 *
 * v14.0: Интеграция с network-hooks.js для real-time SSE-мониторинга
 * - Показ хода стриминга (кол-во токенов, фаза)
 * - Определение завершения через network buffer
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

  // === DOM-based monitoring ===
  const textEls = document.querySelectorAll(sel.text);
  const lastText = textEls[textEls.length - 1];
  const mainText = lastText?.innerText || '';

  const thoughtEls = document.querySelectorAll(sel.thought);
  const lastThought = thoughtEls[thoughtEls.length - 1];
  const thoughtText = lastThought?.innerText || '';

  const toolCallEls = document.querySelectorAll('[class*="tool"], [class*="function-call"], [class*="code-exec"]');
  const toolCalls = Array.from(toolCallEls).map(el => el.textContent?.slice(0, 100)).filter(Boolean);

  const spinner = !!document.querySelector(sel.spinner);

  const lastBubble = lastText?.closest('[class*="message"]') || lastText?.parentElement?.parentElement;
  const actionBtns = lastBubble
    ? Array.from(lastBubble.querySelectorAll('button')).filter(b => b.querySelector('svg')).length
    : 0;

  const domDone = !spinner && mainText.length > 0 && actionBtns >= 2;

  // === Network-based monitoring (v14.0) ===
  const netStats = window.__netBuffer?.stats?.() || null;
  const netLatest = window.__netBuffer?.getLatest?.() || null;
  const netTokens = window.__netBuffer?.getLatestTokens?.() || '';
  const netThinking = window.__netBuffer?.getLatestThinking?.() || '';
  const netDone = netLatest?.complete && netLatest?.method === 'fetch-stream';

  // Combined done: network OR DOM
  const done = netDone || domDone;

  // === Progress estimation ===
  let progressPct = 0;
  let eta = 'unknown';

  if (done) {
    progressPct = 100;
    eta = 'complete';
  } else if (spinner || netLatest) {
    // Rough estimate based on thinking vs answer tokens
    if (netThinking.length > 0 && netTokens.length === 0) {
      progressPct = 30; // still thinking
      eta = '30-60s';
    } else if (netTokens.length > 0) {
      progressPct = 70; // answering
      eta = '10-30s';
    } else {
      progressPct = 10; // just started
      eta = '30-90s';
    }
  } else if (mainText.length > 0) {
    progressPct = 50;
    eta = '15-60s';
  }

  // Phase detection
  let phase = 'idle';
  if (done) phase = 'complete';
  else if (thoughtEls.length > 0 || netThinking.length > 0) phase = 'thinking';
  else if (spinner || netLatest) phase = 'generating';
  else if (toolCalls.length > 0) phase = 'tool-calling';

  return {
    provider: key,
    phase,
    progressPct,
    eta,

    // DOM metrics
    mainTextLen: mainText.length,
    mainText: mainText.slice(0, 500),
    thoughtLen: thoughtText.length,
    thought: thoughtText.slice(0, 300),
    toolCalls: toolCalls.slice(0, 5),
    toolCallCount: toolCallEls.length,
    spinner,
    actionBtns,
    domDone,

    // Network metrics (v14.0)
    networkActive: !!netLatest,
    networkMethod: netLatest?.method || null,
    networkComplete: netLatest?.complete || false,
    networkTokensLen: netTokens.length,
    networkTokens: netTokens.slice(0, 300),
    networkThinkingLen: netThinking.length,
    networkStats: netStats,
    netDone,

    // Combined
    done,
    source: netDone ? 'network' : domDone ? 'dom' : 'pending',

    hint: done ? 'Response complete — read full text'
        : spinner ? 'Still generating — wait and re-check'
        : netLatest ? `Network: ${netLatest.method}, ${netTokens.length} answer tokens`
        : mainText.length > 0 ? 'Text appeared but not complete yet'
        : 'No response yet — wait',
  };
})()
