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
# GLM Chat MCP Skill v10.0 — Compact Edition
---

## 🔴 Обязательная активация

| Провайдер | Триггеры |
|-----------|----------|
| **GLM** | `zai`, `спроси glm`, `ask glm`, `реализуй`, `создай`, `агент`, `исследуй` |
| **Qwen** | `qwen`, `спроси qwen`, `ask qwen`, `обсуди с qwen` |
| **DeepSeek** | `deepseek`, `спроси deepseek`, `ask deepseek` |

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

**Фаза 1 (0-15 сек):** Ждём Stop → генерация началась
**Фаза 2 (до timeout):** Ждём Copy/Regenerate стабильны 3 сек → ответ готов

⚠️ Agent Mode: между tool calls кнопки могут мигнуть — подождать 3 сек и перепроверить.

**Фаза 1 не прошла за 15 сек?** Проверить: ошибка в DOM? редирект на /login? retry 1 раз.

### 7. Прочитать ответ и записать лог
```javascript
const msgs = document.querySelectorAll('.chat-assistant .markdown-prose');
const text = msgs[msgs.length - 1]?.innerText || '';
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

| Сигнал | GLM | Qwen | DeepSeek |
|--------|-----|------|----------|
| Генерация идёт | `button[aria-label*="Stop"]` | `button:has-text("Stop")` | `button:has-text("Stop")` |
| Thinking | `[class*="thinking"]` | `"Generating..."` | `[class*="thinking"]` |
| Готово | `button:has-text("Copy")` | `button:has-text("Copy")` | `button:has-text("Copy")` |
| Ошибка | красный toast/alert | текст в сообщении | красный баннер |

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
const thought = document.querySelector('.thinking-chain-container')?.innerText || '';
const toolCalls = document.querySelectorAll('.tool-call-item');
const mainText = document.querySelector('.chat-assistant:last-of-type .markdown-prose')?.innerText || '';
const hasButtons = !!document.querySelector('.chat-assistant:last-of-type [class*="copy"], .chat-assistant:last-of-type [class*="regenerate"]');
return { thought: thought.slice(0,200), tools: toolCalls.length, textLen: mainText.length, done: hasButtons };
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
3. **extractCodeBlocks():**
```javascript
const blocks = document.querySelectorAll('pre code, [class*="code-block"] pre');
return Array.from(blocks).map(b => ({
  language: b.className.match(/language-(\w+)/)?.[1] || 'unknown',
  code: b.textContent || ''
}));
```
4. **Или полный текст:** `.markdown-prose[last]` → `innerText` (для markdown-презентаций, отчётов)
5. VeAI: для каждого блока → `write_file(target_path, code)`

**Протестировано:** PDF анализ → follow-up «создай презентацию» → 5 слайдов markdown (мультитурн!)

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
- GLM может рендерить Download кнопку (PolarFS) → `browser_click` Download
- **Надёжнее:** добавить в промпт «Покажи весь код прямо в чате, не создавай файл»

**Ограничения:** sandbox (нет ФС), нет git, нет прямого HTTP, таймаут ~5 мин, beforeunload

---

## 🔄 Мультитурновые диалоги

Все провайдеры хранят контекст на сервере. Просто оставаться на том же URL чата и отправлять следующие сообщения. Не создавать новые чаты без необходимости.

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

## 📋 Режимы провайдеров — единая таблица

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
| Copy/Regenerate мигнули и исчезли | Agent Mode — продолжить ожидание |
| beforeunload диалог | Закрыть вкладку, открыть заново |
| Редирект на /login | Предупредить пользователя — нужна авторизация |

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
