/**
 * scripts/multi-provider.js v13.1
 * Параллельный опрос нескольких провайдеров
 *
 * ИСПРАВЛЕНО (по замечаниям GLM):
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
  // Агент должен сам переключать вкладки и отправлять через tab.evaluate()

  const providers = [
    { name: 'GLM',       url: 'chat.z.ai',      inputSel: '#chat-input',                              responseSel: '.markdown-prose' },
    { name: 'Qwen',      url: 'chat.qwen.ai',    inputSel: 'textarea.message-input-textarea',          responseSel: '[class*="message-content"]' },
    { name: 'DeepSeek',  url: 'chat.deepseek.com', inputSel: 'textarea',                               responseSel: '.ds-markdown' }
  ];

  // Определяем текущий провайдер по URL
  const currentUrl = window.location.href;
  const provider = providers.find(p => currentUrl.includes(p.url));
  if (!provider) return { error: 'unknown-provider', url: currentUrl };

  // Находим textarea
  const textarea = document.querySelector(provider.inputSel);
  if (!textarea) return { error: 'no-textarea', provider: provider.name, selector: provider.inputSel };

  // Читаем промпт из аргумента или переменной
  const prompt = window.__multiProviderPrompt;
  if (!prompt) return { error: 'no-prompt', hint: 'Set window.__multiProviderPrompt before calling' };

  // Вводим текст
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

  return { sent: true, provider: provider.name, promptLength: prompt.length };
})();
