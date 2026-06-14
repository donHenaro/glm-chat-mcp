/**
 * scripts/multi-provider.js v14.0
 * Параллельный опрос нескольких провайдеров через provider-adapter
 *
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

  const providers = [
    { name: 'GLM',       url: 'chat.z.ai',      inputSel: '#chat-input',                              responseSel: '.markdown-prose' },
    { name: 'Qwen',      url: 'chat.qwen.ai',    inputSel: 'textarea.message-input-textarea',          responseSel: '[class*="message-content"]' },
    { name: 'DeepSeek',  url: 'chat.deepseek.com', inputSel: 'textarea',                               responseSel: '.ds-markdown' }
  ];

  // Определяем текущий провайдер по URL
  const currentUrl = window.location.href;
  const provider = providers.find(p => currentUrl.includes(p.url));
  if (!provider) return { error: 'unknown-provider', url: currentUrl };

  // === Приоритет: используем adapter если доступен ===
  if (window.__adapter?.send) {
    const prompt = window.__multiProviderPrompt;
    if (!prompt) return { error: 'no-prompt', hint: 'Set window.__multiProviderPrompt before calling', provider: provider.name };
    
    const result = await window.__adapter.send(prompt);
    return { ...result, method: 'adapter' };
  }

  // === Fallback: прямая DOM-отправка ===
  const textarea = document.querySelector(provider.inputSel);
  if (!textarea) return { error: 'no-textarea', provider: provider.name, selector: provider.inputSel };

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

  return { sent: true, provider: provider.name, promptLength: prompt.length, method: 'dom' };
})()
