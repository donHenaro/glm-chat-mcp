---
name: "glm-chat-mcp"
schemaVersion: "v1.0"
description: "MANDATORY ACTIVATION when user says: 'zai', 'спроси glm', 'ask glm', 'обсуди с qwen', 'ask qwen', 'спроси deepseek', 'ask deepseek', 'deepseek'. GLM/Qwen/DeepSeek chat skill with Copy/Regenerate detection. Works with VeAI plugin for IntelliJ IDEA."
agent: null
used-by:
 - "Agent"
 - "Code"
---
# when refactoring, never make changes above this line.
# GLM Chat MCP Skill v12.0 — Strategy Edition
---

## 🔴 Обязательная активация

| Провайдер | Триггеры |
|-----------|----------|
| **GLM** | `zai`, `спроси glm`, `ask glm`, `реализуй`, `создай`, `агент`, `исследуй` |
| **Qwen** | `qwen`, `спроси qwen`, `ask qwen`, `обсуди с qwen` |
| **DeepSeek** | `deepseek`, `спроси deepseek`, `ask deepseek` |
| **Все** | `спроси всех`, `обсуди со всеми`, `мнение экспертов`, `консенсус`, `все провайдеры` |

⛔ Не создавать .js файлы — только Playwright MCP инструменты
⛔ Не закрывать браузер после консультации
✅ Браузер уже открыт — сначала проверить состояние

---

## 🏛️ Архитектура

**UI-отправка + Copy/Regenerate Detection** — единая стратегия для всех провайдеров.

Все 3 провайдера используют защитные механизмы (X-Signature, PoW, Message Tree),
поэтому прямой API **не рекомендуется**. Отправка через UI — подписи обрабатываются автоматически.

**Chat Mode vs Agent Mode (GLM):**
- Chat Mode: 5-15 сек, один шаг, генерация текста
- Agent Mode: 1-5 мин, многошаговый, выполнение действий с инструментами (web_search, code_execution, browser_automation, file_operations)

---

## 🔄 Workflow — 7 шагов

### 1. Определить провайдера и режим
Триггер → провайдер. Agent Mode триггеры: `найди`, `проанализируй`, `выполни код`, `исследуй`, `agent`

### 2. Проверить лог, найти существующий чат
`log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md` → если есть по теме — перейти на URL

### 3. Переключиться на вкладку провайдера

| Провайдер | URL |
|-----------|-----|
| GLM | `https://chat.z.ai/c/<UUID>` |
| Qwen | `https://chat.qwen.ai/c/<UUID>` |
| DeepSeek | `https://chat.deepseek.com/a/chat/s/<UUID>` |

### 4. Выбрать режим (при необходимости)
`browser_snapshot` → кнопка режима → `browser_click`

| GLM | Qwen | DeepSeek |
|-----|------|----------|
| Agent / Deep Think / Web Search | Search toggle / Model select | DeepThink toggle |

### 5. Отправить сообщение
`browser_click` textarea → `browser_type` текст → `browser_press_key` Enter

### 6. Ожидание ответа — двухфазный детектор

**Фаза 1 (0-15 сек):** Ждём spinner или Stop → генерация началась
**Фаза 2 (до timeout):** Ждём 2+ SVG-кнопки (Copy+Regenerate) стабильны 3 сек → ответ готов

⚠️ GLM кнопки — **SVG-иконки без текста**, без title, без aria-label!
⚠️ Agent Mode: между tool calls кнопки мигают — подождать 3 сек и перепроверить.
⚠️ Agent Mode может ЗАВИСНУТЬ: нет spinner, нет Stop, нет Copy → **открыть новый чат**

**Фаза 1 не прошла за 15 сек?** Проверить: ошибка в DOM? редирект на /login? retry 1 раз.

### 7. Прочитать ответ и записать лог
```javascript
// browser_evaluate — GLM Copy/Regenerate detection (проверенный)
const prose = document.querySelectorAll('.markdown-prose');
const last = prose[prose.length - 1];
if (!last) return { done: false };
const parent = last.closest('[class*="message"]') || last.parentElement?.parentElement;
const btns = parent ? parent.querySelectorAll('button') : [];
const actionBtns = Array.from(btns).filter(b => b.className.includes('visible') && b.querySelector('svg'));
return { done: actionBtns.length >= 2, text: last.innerText };
```

---

## 🎯 Response Detection — детализация

### Иерархия надёжности (по данным GLM)

| Приоритет | Индикатор | Надёжность | Примечание |
|:---------:|-----------|:----------:|------------|
| 🥇 1 | Copy / Regenerate кнопки | ⭐⭐⭐⭐⭐ | Пост-рендерный сигнал — только после полного завершения |
| 🥈 2 | Исчезновение Stop | ⭐⭐⭐⭐ | Надёжно, но задержка перед Copy |
| 🥉 3 | Исчезновение thinking | ⭐⭐⭐ | Доп. сигнал, не самостоятельный |
| 4 | innerText.length стабильность | ⭐⭐ | Fallback — ложные срабатывания при Agent Mode паузах |

### Селекторы по провайдерам

**⚠️ GLM кнопки — SVG-иконки без текста!** Нет `title`, нет `aria-label`, нет текста. Определяются по SVG path или позиции.

| Сигнал | GLM | Qwen | DeepSeek |
|--------|-----|------|----------|
| **Chat Input** | `#chat-input` | `textarea.message-input-textarea` | `textarea` |
| **Ответ текст** | `.markdown-prose[last]` | `[class*="message-content"][last]` | `.ds-markdown[last]` |
| Генерация идёт | spinner `[class*="spinner"]` | `button:has-text("Stop")` | `button:has-text("Stop")` |
| Thinking | `[class*="thinking"]` | `"Generating..."` | `[class*="thinking"]` |
| Готово | **2 SVG-кнопки** в `.markdown-prose` parent: кнопка[0]=Copy, кнопка[1]=Regenerate | `button:has-text("Copy")` | `button:has-text("Copy")` |
| Ошибка | красный toast/alert | текст в сообщении | красный баннер |

**GLM детектор готовности (проверенный):**
```javascript
// browser_evaluate — GLM Copy/Regenerate detection
const prose = document.querySelectorAll('.markdown-prose');
const last = prose[prose.length - 1];
if (!last) return { done: false };
const parent = last.closest('[class*="message"]') || last.parentElement?.parentElement;
const btns = parent ? parent.querySelectorAll('button') : [];
// Кнопки Copy/Regenerate = SVG-иконки, без текста, видимые
const actionBtns = Array.from(btns).filter(b => b.className.includes('visible') && b.querySelector('svg'));
return { done: actionBtns.length >= 2, btnCount: actionBtns.length, textLen: last.innerText.length };
```

### Прогресс-модель (5 фаз ожидания)

| Фаза | Индикатор | Polling | ETA |
|------|-----------|---------|-----|
| ОЖИДАНИЕ_СТАРТА (0-5с) | Stop не видна | каждые 2 сек | — |
| ГЕНЕРАЦИЯ_НАЧАЛАСЬ (5-15с) | Stop видна | каждые 5 сек | — |
| КОНТЕНТ_ИДЁТ (15с-?) | Stop видна + текст растёт | каждые 10 сек | зависит от режима |
| THINKING | `[class*="thinking"]` виден | каждые 10 сек | Chat=5-30с, Agent=1-5мин |
| АГЕНТ_ВЫЗЫВАЕТ_ИНСТРУМЕНТ | Stop исчезла, Copy нет | каждые 5 сек | 30-90с на инструмент |

### Таймауты по режиму

| Режим | Таймаут | Обычно |
|-------|---------|--------|
| Chat | 60 сек | 5-15 сек |
| Web Search | 90 сек | 15-60 сек |
| Deep Think | 120 сек | 30-90 сек |
| Agent Mode | 300 сек (5 мин) | 1-5 мин |
| Agent + Deep Think | 480 сек (8 мин) | 3-8 мин |

---

## 🤖 GLM Agent Mode — Операционные инструкции

**Инструменты:** web_search, code_execution, browser_automation, file_operations, mcp_servers
**Включение:** `.toolbar-icon.agent` → click (если нет — уже включён)
⚠️ **beforeunload:** browser_automation может заблокировать Playwright. Решение: Copy/Regenerate detection.

| Ситуация | Режим | Таймаут |
|----------|-------|---------|
| Простой вопрос / код-ревью | Chat Mode | 60с |
| Deep Think | Chat Mode + thinking | 120с |
| Всё что требует действий | Agent Mode | 300-480с |

### Прогресс-мониторинг (читать ход Agent Mode)
```javascript
// browser_evaluate — понимать что происходит
const thought = document.querySelector('[class*="thinking"]')?.innerText || '';
const toolCalls = document.querySelectorAll('[class*="tool-call"]');
const prose = document.querySelectorAll('.markdown-prose');
const mainText = prose[prose.length - 1]?.innerText || '';
const parent = prose[prose.length-1]?.closest('[class*="message"]') || prose[prose.length-1]?.parentElement?.parentElement;
const btns = parent ? parent.querySelectorAll('button') : [];
const actionBtns = Array.from(btns).filter(b => b.className.includes('visible') && b.querySelector('svg'));
const spinner = !!document.querySelector('[class*="spinner"]');
return { thought: thought.slice(0,200), tools: toolCalls.length, textLen: mainText.length, done: actionBtns.length >= 2, spinner };
```

### Сценарий 1: Анализ файлов
1. **Загрузить файл (без кнопки "+"):** `input[type=file].setInputFiles(absPath)`
   - GLM рендерит preview: «filename.ext · X.X MB»
   - ⚠️ Исходный код: скопировать в `/tmp/name_uuid.txt` → загружать `.txt` (GLM блокирует `.java/.js/.ts/.kt/.go/.rs/.cpp`)
   - ✅ Нативные: `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.txt`, `.md`, `.py`, изображения
2. textarea: «Проанализируй прикреплённый файл. Найди: 1) Баги 2) Уязвимости 3) Нарушения паттернов»
3. waitForCompletion(480с, phase='agent') — Agent запускает tool calls для извлечения текста
4. Прочитать: `.markdown-prose` последнего сообщения

**Протестировано:** PDF 4.8MB (86 стр) → GLM Agent (8 tool calls, ~30 сек) → полный анализ 3460 симв
**Загрузка файлов:** `input[type=file].setInputFiles(absPath)` — GLM рендерит preview «filename.ext · X.X MB»

### Сценарий 2: Генерация и извлечение кода / контента
1. textarea: «Создай [описание]. Покажи весь код/результат прямо в чате.» → Enter
2. waitForCompletion(300с)
3. **Прочитать ответ** — GLM НЕ использует `<pre><code>`, всё в plain text:
```javascript
// browser_evaluate — универсальное чтение ответа
const prose = document.querySelectorAll('.markdown-prose');
const text = prose[prose.length - 1]?.innerText || '';
const clean = text.replace(/^Thought Process\n/, '').trim();
return clean;
```
4. VeAI: `write_file(target_path, clean)` — сохранить текст как файл

**Протестировано:** PDF → follow-up «создай презентацию» → 5 слайдов markdown (мультитурн!)

### Сценарий 3: Редактирование репозитория
1. textarea: «В репозитории [путь]: 1) Найди баги 2) Предложи исправления 3) Покажи diff. Показывай ход работы.»
2. waitForCompletion(480с) — Agent: plan → read → edit → verify (5-10 tool calls)
3. Между tool calls кнопки мигают — **НЕ считать готовым**, ждать стабильных 3 сек
4. extractCodeBlocks() → VeAI: `edit_file()` с полученными патчами
5. Если неполный: follow-up «Продолжи с последнего шага»

### Сценарий 4: Web-исследование
1. `.toolbar-icon.search` → click (или Agent+Search)
2. textarea: «Найди информацию о [тема] в интернете»
3. waitForCompletion(480с) — Agent: search → read pages → synthesize
4. Прочитать `.markdown-prose` — URL источников встроены в текст

### Сценарий 5: Telegram / внешние интеграции
⚠️ GLM **не может** отправлять в Telegram напрямую (sandbox, нет HTTP)
1. VeAI → GLM: «Напиши Python-скрипт для отправки сообщения в Telegram через Bot API. Используй плейсхолдеры BOT_TOKEN и CHAT_ID»
2. extractCodeBlocks() → получить код
3. **НА СТОРОНЕ VeAI:** подставить реальный токен (НИКОГДА не упоминать токен в промпте GLM!)
4. `write_file('telegram_bot.py', code)` → `run_command python telegram_bot.py`

### Сценарий 6: Получение файлов от GLM

**Метод A: Blob-перехват (рекомендуется)** ✅ Протестировано
GLM при клике Download создаёт blob через `URL.createObjectURL()` — перехватываем:
```javascript
// browser_evaluate — перехват blob + клик Download
const result = await page.evaluate(() => {
  return new Promise((resolve) => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
      const blobUrl = orig.call(URL, blob);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve({ success: true, type: blob.type, size: blob.size, content: atob(base64) });
      };
      reader.readAsDataURL(blob);
      return blobUrl;
    };
    setTimeout(() => {
      document.querySelector('button[title="Download file"]')?.click();
      setTimeout(() => resolve({ error: 'timeout' }), 5000);
    }, 100);
  });
});
// result.content = декодированное содержимое файла → write_file()
```
**Протестировано:** Agent → result.json → blob-перехват → `{"status":"ok","count":42}` ✅

**Метод B: Текст из чата (fallback)**
Промпт: «Покажи содержимое прямо в чат» → `innerText` → `write_file()`
⚠️ GLM **НЕ рендерит `<pre><code>`** — всё в plain text

**Условие Download кнопки:** нужен Agent Mode + `code_execution` (файл в sandbox)
**Ограничения:** нет файлового сервера/URL, sandbox, нет git, нет HTTP

---

## 🔄 Мультитурновые диалоги

Все провайдеры хранят контекст на сервере. Просто оставаться на том же URL чата и отправлять следующие сообщения. Не создавать новые чаты без необходимости.

---

## 🌐 Параллельные консультации (Multi-Provider)

**Триггеры:** `спроси всех`, `обсуди со всеми`, `мнение экспертов`, `консенсус`, `все провайдеры`

Агент открывает вкладку для каждого провайдера и отправляет вопрос **параллельно**, затем собирает ответы, критически анализирует и организует дискуссию до консенсуса.

### Workflow — 6 шагов

**Шаг 1. Определить участников**
По умолчанию: GLM + Qwen + DeepSeek. Можно указать подмножество: `спроси glm и qwen`

**Шаг 2. Подготовить вкладки**
```javascript
// browser_evaluate — проверить/открыть вкладки
const tabs = await page.context().pages();
const providers = {
  glm: tabs.find(t => t.url().includes('chat.z.ai')),
  qwen: tabs.find(t => t.url().includes('chat.qwen.ai')),
  deepseek: tabs.find(t => t.url().includes('chat.deepseek.com'))
};
// Если вкладки нет — открыть: await page.context().newPage(url)
```

**Шаг 3. Отправить вопрос параллельно**
Для каждого провайдера: переключить вкладку → вставить текст в textarea → Enter
```javascript
// Отправка на каждую вкладку последовательно (Playwright однопоточный)
for (const [name, tab] of Object.entries(providers)) {
  await tab.bringToFront();
  const input = await tab.$('#chat-input') || await tab.$('textarea');
  if (input) { await input.fill(question); await input.press('Enter'); }
}
```

**Шаг 4. Собрать ответы**
Опросить каждую вкладку с детектором готовности:
```javascript
// Сбор ответов — опрашивать по кругу
const answers = {};
for (const [name, tab] of Object.entries(providers)) {
  await tab.bringToFront();
  // Использовать детектор по провайдеру (см. Response Detection)
  const prose = await tab.evaluate(() => {
    const els = document.querySelectorAll('.markdown-prose');
    return els[els.length - 1]?.innerText || '';
  });
  answers[name] = prose;
}
```

**Шаг 5. Критический анализ VeAI**
VeAI — **оркестратор дискуссии**:
1. Сравнить ответы: общие точки, разногласия, уникальные инсайты
2. Если есть **разногласия** → сформулировать уточняющий вопрос
3. Если есть **уязвимости в аргументации** → оспорить
4. Отправить **один и тот же follow-up** каждому провайдеру
5. Повторить шаги 4-5 до консенсуса (макс 3 раунда)

**Шаг 6. Зафиксировать консенсус**
```markdown
## Консенсус экспертов
### Общее мнение:
[точки где все согласны]
### Разногласия:
[точки где мнения расходятся]
### Итоговое решение:
[обоснованный вывод VeAI на основе анализа всех мнений]
```
Записать в лог чата.

### Формат промпта для провайдеров
При параллельной консультации добавлять префикс:
```
[Мульти-консультация] Ответь на вопрос: {вопрос}
Если не уверен — явно укажи уровень уверенности (высокий/средний/низкий).
```

### Follow-up для дискуссии
```
[Мульти-консультация — Раунд N]
Другие эксперты ответили:
- GLM: [ключевое]
- Qwen: [ключевое]
- DeepSeek: [ключевое]
Разногласия: [описание]
Прокомментируй позицию других. Изменишь ли своё мнение?
```

### Таймауты для параллельного режима
| Кол-во провайдеров | Таймаут на раунд | Макс раундов |
|:------------------:|:-----------------:|:------------:|
| 1 | по режиму | — |
| 2 | 120 сек | 3 |
| 3 | 180 сек | 3 |

---

## 📎 Файлы

### Метод 1: Прямая загрузка (без кнопки "+") — рекомендуется
```javascript
// browser_evaluate или Playwright setInputFiles — напрямую в hidden input
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles('C:\\path\\to\\file.pdf');
// GLM рендерит preview: «filename.ext · X.X MB»
```

### Метод 2: Через UI (кнопка "+")
1. `browser_click` "+" → "Upload" → file chooser

### Автоконвертация исходного кода
⚠️ GLM **фильтрует** расширения исходного кода → **переименовать в `.txt`** перед загрузкой:
- Блокируются: `.java`, `.js`, `.ts`, `.kt`, `.scala`, `.go`, `.rs`, `.cpp`, `.c`, `.cs`, `.rb`, `.php`, `.swift`
- VeAI: `copy file → /tmp/original_name_uuid.txt → setInputFiles(/tmp/...txt)`

### Нативные форматы (загружать как есть)
| Провайдер | Форматы |
|-----------|--------|
| **GLM** | `.pdf`, `.docx`, `.doc`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.md`, `.py`, `.bmp`, `.gif`, `.mp4` |
| **Qwen** | `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.txt`, `.md`, изображения |
| **DeepSeek** | `.pdf`, `.docx`, `.txt`, `.md`, изображения (DataTransfer API) |

### Удаление файла из превью
```javascript
// Кнопка X на файле (invisible до hover)
await page.locator('button[class*="invisible"]').first().click();
```

---

## 🧠 Стратегия диалога — паттерны и оптимизация

### Ключевой принцип
Бесплатные веб-чаты имеют жёсткие лимиты контекста (8-32K токенов).
**Стратегия:** сжимать вход + декомпозировать задачи + использовать мультитурн для уточнения.

### Паттерн 1: «Ревью с фокусом» (код-ревью)
**Шаг 1:** Отправить только сигнатуры + проблемный метод
**Шаг 2:** По запросу чата — добавить контекст (соседние методы, конфигурацию)
```
[КОНТЕКСТ]
Проект: {name}, Spring Boot {version}, Java {version}
Модуль: {module}
Архитектура: {pattern}

[КОД — СИГНАТУРЫ КЛАССА]
public class {Class} {
    public {ReturnType} {method}({...}) {...}
}

[КОД — МЕТОД ДЛЯ РЕВЬЮ]
// Только проблемный метод
```
**Формат ответа (просить чат):**
```
[КРИТИЧНО]: ... (блокирующие деплой)
[ОПТИМИЗАЦИЯ]: ... (можно улучшить)
[ВОПРОС]: ... (требует уточнения)
```

### Паттерн 2: «Chunk + Summarize» (анализ документации)
**Шаг 1:** Разбить документ на смысловые блоки по ~4000 токенов
**Шаг 2:** Для каждого блока: «Извлеки ключевые термины, отметь противоречия, ссылки»
**Шаг 3:** Финальный запрос: «Синтезируй общую картину из всех чанков»

**Для Confluence/Jira:**
- Экспорт страницы → PDF → `setInputFiles()` в GLM Agent Mode
- Или: скопировать текст → вставить в чат с пометкой `[ДОКУМЕНТ — часть N/M]`

### Паттерн 3: «Фильтр + Сэмпл» (анализ логов)
**Проблема:** Логи могут быть 100K+ строк — не влезет в контекст.
**Решение:**
1. VeAI фильтрует: `grep -A5 -B5 "ERROR\|Exception\|Caused by" app.log | head -200`
2. Отправить только стектрейсы + 5 строк контекста вокруг ошибки
3. Пометить: `[ЛОГИ — фильтр ERROR, последние 50 инцидентов]`
```
[КОНТЕКСТ]
Сервис: {name}, контур: {env}
Временной диапазон: {period}
Количество ERROR: {count}

[ЛОГИ — первые 5 инцидентов]
2026-06-12 10:15:32 ERROR [pool-3] c.g.t.TransferServiceImpl - Cradle upload failed
Caused by: java.net.ConnectException: Connection refused
...
```

### Паттерн 4: «Генерация + Извлечение» (создание кода/файлов)
1. Промпт: «Создай [описание]. Покажи весь код/результат прямо в чат.»
2. Для файлов: Agent Mode + blob-download (см. Сценарий 6)
3. Для кода: `innerText` → `write_file()`

### Паттерн 5: «Мульти-консультация» (параллельный опрос)
См. секцию 🌐 Параллельные консультации

### Контекстный чекпоинтинг
Между запросами в длинной сессии — VeAI должен сохранять:
- Что уже отправлено чату (избегать повторов)
- Что чат уже знает (не дублировать контекст)
- Текущую подзадачу (фокус диалога)

Запись в лог: `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`

### Оптимизация токенов
| Техника | Когда | Экономия |
|---------|-------|----------|
| Сигнатуры вместо полного кода | Код-ревью | 60-80% |
| Фильтрация ERROR + head | Логи | 90-95% |
| Chunking по 4K токенов | Документация | 50-70% |
| Мультитурн вместо одного мегапромпта | Все сценарии | 30-50% |
| Параллельные консультации | Когда нужны разные мнения | 0% (но выше качество) |

### Уровни уверенности по сценариям (по данным GLM)
| Сценарий | Уверенность | Комментарий |
|----------|-------------|-------------|
| Код-ревью | 90% | Чаты хорошо читают Java/Spring |
| Анализ PDF/DOCX | 60% | Зависит от file upload + Agent Mode |
| Анализ логов | 85% | Отлично при правильной фильтрации |
| Генерация кода + blob | 70% | Blob-перехват работает, но нестабильно |
| Параллельные консультации | 95% | Сильная сторона Playwright |

| Режим | GLM (features) | Qwen (feature_config) | DeepSeek (model) |
|-------|----------------|----------------------|-------------------|
| Обычный | по умолчанию | `thinking_enabled:false` | `deepseek-chat` |
| Deep Think | `enable_thinking:true` + `reasoning_effort:"max"` | `thinking_enabled:true, thinking_mode:"Deep"` | `deepseek-reasoner` |
| Web Search | `web_search:true` | `auto_search:true` | Search toggle |
| Agent | `flags:["general_agent"]` | — | — |

---

## ❌ Ошибки и Recovery

| Ситуация | Действие |
|----------|----------|
| Stop не появилась за 15 сек | Проверить DOM ошибки, login redirect, retry 1 раз |
| Rate limit (429 / toast) | Подождать 30 сек, retry 1 раз |
| Session expired (→ /login) | Уведомить пользователя, НЕ пытаться логиниться |
| Empty response (текст пустой) | Retry 1 раз, если снова пустой → ошибка |
| Partial response (обрыв кода) | Проверить `[class*="error"]` в DOM: есть → retry, нет → вернуть что есть + предупреждение |
| **Agent Mode завис** (нет spinner, нет Stop, нет Copy, textarea заблокирован) | **Открыть новый чат** (`chat.z.ai/`), НЕ пытаться реанимировать |
| Copy/Regenerate мигнули и исчезли | Agent Mode — продолжить ожидание |
| beforeunload диалог | Закрыть вкладку, открыть заново |
| Редирект на /login | Предупредить пользователя — нужна авторизация |
| **Селектор не найден** (DOM обновился) | Startup Health-Check: при инициализации проверить все селекторы → ошибка "Selector outdated for X" |
| **Anti-Bot / тихий бан** (403, пустой ответ) | Использовать playwright-extra stealth; human-like typing (50-150мс задержки) |
| **Context Overflow** (UI: "Сообщение слишком длинное") | Извлечь историю → суммаризировать → новый чат с саммари |
| **Один провайдер упал** (мульти-консультация) | Graceful degradation: продолжить с оставшимися, логировать ошибку |
| **State Drift** (пользователь кликнул в браузере) | Перед отправкой: верифицировать textarea пустой → если нет → reload |

---

## 🛡️ Production Readiness (по результатам мульти-консультации)

### Startup Health-Check
При инициализации скилла — проверить все селекторы:
```javascript
// browser_evaluate — health check
const checks = {
  glm: !!document.querySelector('.markdown-prose'),
  qwen: !!document.querySelector('[class*="message-content"]'),
  deepseek: !!document.querySelector('.ds-markdown')
};
// Если селектор не найден → "Selector outdated for Provider X"
```

### Anti-Bot защита
- Использовать `playwright-extra` с плагином `stealth`
- **НЕ** использовать `page.fill()` — использовать human-like typing:
```javascript
// Кастомная функция ввода с рандомными задержками
async function humanType(input, text) {
  for (const char of text) {
    await input.type(char, { delay: 50 + Math.random() * 100 });
  }
}
```
- Рандомные паузы между запросами (2-5 сек)

### Multi-tier Locators (fallback-цепочка)
Для каждого элемента — массив локаторов по приоритету:
```
GLM response: ['.markdown-prose', '[class*="prose"]', '[role="article"]']
Qwen response: ['[class*="message-content"]', '.markdown-body', '[role="article"]']
DeepSeek response: ['.ds-markdown', '[class*="markdown"]', '[role="article"]']
```

### Resource Management
- 3 персистентных контекста (по одному на провайдера) — НЕ создавать новый на запрос
- `browserContext.close()` при остановке MCP-сервера
- Мониторинг RAM: если вкладка >500MB → перезагрузить

### Context Overflow Recovery
1. Парсить UI-ошибку: "Сообщение слишком длинное" / "History exceeded"
2. Извлечь всю историю чата (все `.markdown-prose`)
3. Суммаризировать локально или через дешёвый API
4. Создать новый чат → отправить саммари как системный промпт

---

## 📋 Лог чатов

`log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`

```
| [дата] | [время] | [UUID] | [тема] | [URL] | [провайдер] | [режим] | ✅ |
```

---

## 🏗️ Архитектура проекта

```
glm-chat-mcp/                     ← https://github.com/donHenaro/glm-chat-mcp
├── SKILL.md                      ← инструкции агента (этот файл)
├── reference.md                  ← техническая справка API
└── log/                          ← логи чатов
```

### Репозиторий: https://github.com/donHenaro/glm-chat-mcp.git

---

## 📋 Changelog

### v10.0.0 (current) — Copy/Regenerate Detection + Compact

**Breaking changes:**
- Response detection: bubble-reading → Copy/Regenerate buttons
- Двухфазный детектор: Фаза 1 (Stop) → Фаза 2 (Copy/Regenerate stable 3 сек)
- SSE-intercept вынесен в reference.md
- SKILL.md сжат: 756 → 200 строк

### v9.2 — bubble-reading, Agent Mode docs

### v9.0 — multiturn, files, Agent Mode, dead code cleanup (45 files removed)

### v8.0 — direct API access, no webchat2api dependency

### v7.0 — dual-mode architecture, DeepSeek provider
