/**
 * scripts/multi-collect.js v14.0
 * Сбор ответов от нескольких провайдеров через adapter + network buffer
 *
 * Вызывается ПОСЛЕ отправки (multi-provider.js) и ожидания ответов.
 * Работает в контексте текущей вкладки провайдера.
 *
 * Вызов: browser_evaluate(filename='multi-collect.js')
 */
(() => {
  const providers = [
    { name: 'GLM',       url: 'chat.z.ai' },
    { name: 'Qwen',      url: 'chat.qwen.ai' },
    { name: 'DeepSeek',  url: 'chat.deepseek.com' }
  ];

  const currentUrl = window.location.href;
  const provider = providers.find(p => currentUrl.includes(p.url));
  if (!provider) return { error: 'unknown-provider', url: currentUrl };

  // === Приоритет 1: Adapter read (network-aware) ===
  if (window.__adapter?.read) {
    const result = window.__adapter.read();
    if (result.text && result.text.length > 0) {
      return { ...result, provider: provider.name, method: 'adapter' };
    }
  }

  // === Приоритет 2: Network buffer ===
  const netTokens = window.__netBuffer?.getLatestTokens?.();
  if (netTokens && netTokens.length > 0) {
    return { text: netTokens, len: netTokens.length, source: 'network', provider: provider.name, method: 'network' };
  }

  // === Приоритет 3: AI Extract ===
  if (window.__aiExtract?.extract) {
    const result = window.__aiExtract.extract();
    if (result) {
      return { text: result.text, len: result.len, source: result.source, provider: provider.name, method: 'ai-extract' };
    }
  }

  // === Приоритет 4: DOM fallback ===
  const sels = {
    GLM: ['.markdown-prose', '[class*="prose"]'],
    Qwen: ['[class*="message-content"]', '.markdown-body'],
    DeepSeek: ['.ds-markdown', '[class*="markdown"]'],
  };
  const strategies = sels[provider.name] || sels.GLM;
  for (const sel of strategies) {
    try {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        const last = els[els.length - 1];
        const text = (last.innerText || '').replace(/^Thought Process\n/, '').trim();
        if (text.length > 0) {
          return { text, len: text.length, source: `dom:${sel}`, provider: provider.name, method: 'dom' };
        }
      }
    } catch {}
  }

  return { error: 'no-response', provider: provider.name, hint: 'Response not ready yet' };
})()
