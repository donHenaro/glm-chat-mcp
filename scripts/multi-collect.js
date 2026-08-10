/**
 * scripts/multi-collect.js v15.3
 * Сбор ответов от нескольких провайдеров через adapter + network buffer
 *
 * v15.3: Селекторы делегированы в spec.js (window.__spec.SELECTORS)
 * v14.0: Добавлен network buffer как источник данных
 *
 * Вызывается ПОСЛЕ отправки (multi-provider.js) и ожидания ответов.
 * Работает в контексте текущей вкладки провайдера.
 *
 * Вызов: browser_evaluate(filename='multi-collect.js')
 */
(() => {
  const providerKey = window.__spec.detectProvider();

  // === Приоритет 1: Adapter read (network-aware) ===
  if (window.__adapter?.read) {
    const result = window.__adapter.read();
    if (result.text && result.text.length > 0) {
      return { ...result, provider: providerKey, method: 'adapter' };
    }
  }

  // === Приоритет 2: Network buffer ===
  const netTokens = window.__netBuffer?.getLatestTokens?.();
  if (netTokens && netTokens.length > 0) {
    return { text: netTokens, len: netTokens.length, source: 'network', provider: providerKey, method: 'network' };
  }

  // === Приоритет 3: AI Extract ===
  if (window.__aiExtract?.extract) {
    const result = window.__aiExtract.extract();
    if (result) {
      return { text: result.text, len: result.len, source: result.source, provider: providerKey, method: 'ai-extract' };
    }
  }

  // === Приоритет 4: DOM fallback from spec.js ===
  const sels = window.__spec.SELECTORS[providerKey] || window.__spec.SELECTORS.glm;
  const strategies = [sels.response.primary, ...sels.response.fallbacks];
  for (const sel of strategies) {
    try {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        const last = els[els.length - 1];
        const text = (last.innerText || '').replace(/^Thought Process\n/, '').trim();
        if (text.length > 0) {
          return { text, len: text.length, source: `dom:${sel}`, provider: providerKey, method: 'dom' };
        }
      }
    } catch {}
  }

  return { error: 'no-response', provider: providerKey, hint: 'Response not ready yet' };
})()
