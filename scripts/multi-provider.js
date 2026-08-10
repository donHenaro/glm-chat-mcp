/**
 * scripts/multi-provider.js v15.3
 * Параллельный опрос нескольких провайдеров через provider-adapter
 *
 * v15.3: Селекторы делегированы в spec.js (window.__spec.SELECTORS)
 * v14.0: Использует window.__adapter.send()/read() вместо прямых DOM-операций
 * v13.1: ИСПРАВЛЕНО (по замечаниям GLM):
 * 1. collectResponses() НЕ использует document.querySelectorAll (это другой tab!)
 * 2. Каждый tab читается через tab.evaluate()
 * 3. Rate limiting 2 сек между отправками
 * 4. Ответы собираются отдельно в каждом tab
 *
 * Вызов: browser_evaluate(filename='multi-provider.js')
 * Важно: отправка и сбор — ДВА РАЗНЫХ вызова!
 */
(async () => {
  // === ЭТАП 1: ОТПРАВКА (быстрая) ===

  const providerKey = window.__spec.detectProvider();
  const spec = window.__spec.SELECTORS[providerKey] || window.__spec.SELECTORS.glm;

  // Определяем текущий провайдер по URL
  const currentUrl = window.location.href;
  const providerUrl = window.__spec.PROVIDER_URLS[providerKey];
  if (!currentUrl.includes(providerUrl)) return { error: 'unknown-provider', url: currentUrl };

  // === Приоритет: используем adapter если доступен ===
  if (window.__adapter?.send) {
    const prompt = window.__multiProviderPrompt;
    if (!prompt) return { error: 'no-prompt', hint: 'Set window.__multiProviderPrompt before calling', provider: providerKey };
    
    const result = await window.__adapter.send(prompt);
    return { ...result, method: 'adapter' };
  }

  // === Fallback: прямая DOM-отправка ===
  const textarea = document.querySelector(spec.input.primary);
  if (!textarea) return { error: 'no-textarea', provider: providerKey, selector: spec.input.primary };

  const prompt = window.__multiProviderPrompt;
  if (!prompt) return { error: 'no-prompt', hint: 'Set window.__multiProviderPrompt before calling' };

  // Вводим текст через native setter (React compatibility)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(textarea, prompt);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));

  // Ждём 300мс (имитация человека)
  await new Promise(r => setTimeout(r, 300));

  // Отправляем Enter
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  return { sent: true, provider: providerKey, promptLength: prompt.length, method: 'dom' };
})()
