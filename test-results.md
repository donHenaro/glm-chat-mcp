# Test Results — GLM Feature Audit (2026-06-12)

## Тест 1: Отправка сообщения
- ✅ `#chat-input` + `fill()` + `press('Enter')` — работает
- ✅ GLM отвечает за 3-10 сек (Chat Mode)
- ⚠️ Agent Mode может зависнуть (textarea блокируется)

## Тест 2: Response Detection — КНОПКИ
### КРИТИЧЕСКОЕ: GLM кнопки — SVG-иконки без текста!

| Ожидалось | Реальность |
|-----------|-----------|
| `button[aria-label*="Stop"]` | ❌ Нет aria-label |
| `button[class*="copy"]` | ❌ Класс одинаков для Copy и Regenerate |
| `button:has-text("Copy")` | ❌ Нет текста (SVG-иконка) |
| `button[class*="stop"]` | ❌ Нет класса stop |

### Реальные селекторы:
- **Copy**: `visible p-1 hover:bg-black/5...rounded-lg` + SVG path `M12.668 10.667C12.668 9.95614`
- **Regenerate**: тот же класс + SVG path `M17.0441 10.7439C16.8126 12.9188`
- **Stop**: не найдена (появляется только во время генерации, исчезает до проверки)
- **Agent Toggle**: кнопка с текстом `"Agent"`, класс `self-stretch p-2 bg-white`
- **Chat Toggle**: кнопка с текстом `"Chat"`

### Надёжный детектор готовности:
```javascript
const prose = document.querySelectorAll('.markdown-prose');
const last = prose[prose.length - 1];
const parent = last?.closest('[class*="message"]') || last?.parentElement?.parentElement;
const btns = parent ? parent.querySelectorAll('button') : [];
const actionBtns = Array.from(btns).filter(b => b.className.includes('visible') && b.querySelector('svg'));
// actionBtns.length >= 2 → ответ готов (Copy + Regenerate)
```

## Тест 3: File Upload
- ✅ `page.locator('input[type="file"]').setInputFiles(absPath)` — работает
- ✅ GLM рендерит preview «SKILL.md MD · 14.9 KB»
- ⚠️ `fi.files.length` = 0 после загрузки (Svelte очищает input)

## Тест 4: PDF Upload
- ✅ PDF 4.8MB загружен через `setInputFiles`
- ✅ GLM Agent Mode (8 tool calls) извлёк текст за 30 сек
- ✅ Полный анализ 86-стр PDF → 3460 симв ответа

## Тест 5: Blob-download
- ✅ `URL.createObjectURL` перехват + `button[title="Download file"]` click
- ✅ Файл `data.json` → `{"status":"ok","count":42}` — получен
- ⚠️ Download кнопка рендерится только при Agent Mode + code_execution
- ⚠️ Download кнопка СКРЫТА (hidden) — нужна программная активация

## Тест 6: Мультитурн
- ✅ Follow-up в том же чате → GLM помнит контекст
- ✅ PDF анализ → «создай презентацию» → 5 слайдов (мультитурн работает)

## Тест 7: Agent Mode Issues
- ⚠️ Agent Mode может ЗАВИСНУТЬ (нет spinner, нет Stop, нет Copy)
- ⚠️ При зависании textarea блокируется — нельзя отправить follow-up
- ⚠️ beforeunload от browser_automation блокирует Playwright
- ✅ Решение: открыть новый чат (navigate to chat.z.ai/)

## Тест 8: Progress Monitoring
- ✅ `[class*="thinking"]` — работает для Deep Think
- ✅ `.markdown-prose[last].innerText` — работает для чтения ответа
- ✅ `spinner: !!document.querySelector('[class*="spinner"]')` — работает
- ❌ `.chat-assistant` — класс НЕ существует в DOM
- ❌ `.thinking-chain-container` — нестабильный селектор
- ❌ `.tool-call-item` — нестабильный селектор

## Рекомендации для SKILL.md v11:

1. **Заменить селектор Copy** с `button[class*="copy"]` на SVG-based detection
2. **Добавить spinner detection** как основной индикатор генерации
3. **Добавить Agent Mode timeout + recovery** — при зависании → новый чат
4. **Убрать `.chat-assistant`** — не существует в DOM
5. **Использовать `[class*="thinking"]`** вместо `.thinking-chain-container`
6. **Использовать `[class*="tool-call"]`** вместо `.tool-call-item`

---

## Тест 9: Параллельные консультации (Multi-Provider)

**Вопрос:** Какой подход к обработке ошибок в микросервисной архитектуре Spring Boot?

### Результаты отправки:
| Провайдер | Input селектор | Отправлено |
|-----------|---------------|:----------:|
| GLM | `#chat-input` | ✅ |
| DeepSeek | `textarea` | ✅ |
| Qwen | `textarea.message-input-textarea` | ✅ |

### Результаты чтения:
| Провайдер | Ответ селектор | Уверенность | Подход |
|-----------|---------------|-------------|--------|
| GLM | `.markdown-prose[last]` | 9/10 | Многоуровневая + @ControllerAdvice + ApiError (кастомный) |
| DeepSeek | `.ds-markdown[last]` | 95% | RFC 7807 + @ControllerAdvice + ErrorResponse |
| Qwen | `[class*="message-content"][last]` | 95% | RFC 9457 (ProblemDetail Spring 3 нативно) + 5 уровней |

### Консенсус:
- ✅ Все 3 согласны: @ControllerAdvice + стандартизированный формат ошибок
- ⚠️ Разногласие: GLM → кастомный DTO, Qwen+DeepSeek → RFC 7807/9457
- 🏆 Qwen даёт самое современное решение (Spring 3 нативный ProblemDetail)

### Селекторы открытые:
| Провайдер | Chat Input | Response Text |
|-----------|-----------|---------------|
| GLM | `#chat-input` | `.markdown-prose` |
| Qwen | `textarea.message-input-textarea` | `[class*="message-content"]` |
| DeepSeek | `textarea` | `.ds-markdown` |
