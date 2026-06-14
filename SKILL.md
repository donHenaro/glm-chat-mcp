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
# GLM Chat MCP Skill v14.0 — Network Intelligence Edition
---

## 🔴 Обязательная активация

| Провайдер | Триггеры |
|-----------|----------|
| **GLM** | `zai`, `спроси glm`, `ask glm`, `реализуй`, `создай`, `агент`, `исследуй` |
| **Qwen** | `qwen`, `спроси qwen`, `ask qwen`, `обсуди с qwen` |
| **DeepSeek** | `deepseek`, `спроси deepseek`, `ask deepseek` |
| **Все** | `спроси всех`, `обсуди со всеми`, `мнение экспертов`, `консенсус`, `все провайдеры` |

⛔ Не закрывать браузер после консультации
✅ Браузер уже открыт — сначала проверить состояние
📁 JS-скрипты в `scripts/` — загружать через `read_file` → `browser_evaluate`

---

## 🏛️ Архитектура

**Network Intelligence + UI-отправка** — двухуровневая стратегия:

| Уровень | Метод | Надёжность | Когда использовать |
|---------|-------|:----------:|-------------------|
| 🥇 1 | Network interception (fetch/EventSource) | ⭐⭐⭐⭐⭐ | Основной — не зависит от DOM |
| 🥈 2 | DOM-селекторы + fallback-цепочки | ⭐⭐⭐ | Fallback — если network hooks не установлены |

Все 3 провайдера используют защитные механизмы (X-Signature, PoW, Message Tree),
поэтому прямой API **не рекомендуется**. Отправка через UI — подписи обрабатываются автоматически.

**v14.0 Ключевые улучшения (по анализу аналогов):**
- **Network hooks** — перехват fetch/EventSource на уровне страницы (вдохновлено: page.route() + Chat2API)
- **Provider adapter** — унифицированный интерфейс для всех провайдеров (вдохновлено: WebModel)
- **Session manager** — persistent sessions через cookies/localStorage (вдохновлено: storageState() + Steel.dev)
- **CloakBrowser support** — рекомендация stealth Chromium (вдохновлено: CloakBrowser 26K⭐)

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
`read_file('scripts/response.js')` → `browser_evaluate(readResponse('glm'))`
Вернёт: `{ done: true/false, textLen, text, source: 'network'|'dom', provider }`

**v14.0:** Если установлены network hooks, ответ сначала ищется в SSE-буфере (network-hooks.js),
затем — через DOM-селекторы. Это кардинально повышает надёжность detection.

---

## 🎯 Response Detection — детализация

### Иерархия надёжности (v14.0 — обновлено по анализу аналогов)

| Приоритет | Индикатор | Надёжность | Источник | Примечание |
|:---------:|-----------|:----------:|----------|------------|
| 🥇 0 | Network buffer (SSE-токены) | ⭐⭐⭐⭐⭐ | network-hooks.js | Перехват на уровне HTTP — не зависит от DOM |
| 🥈 1 | Copy / Regenerate кнопки | ⭐⭐⭐⭐⭐ | DOM | Пост-рендерный сигнал — только после полного завершения |
| 🥉 2 | Исчезновение Stop | ⭐⭐⭐⭐ | DOM | Надёжно, но задержка перед Copy |
| 3 | Исчезновение thinking | ⭐⭐⭐ | DOM | Доп. сигнал, не самостоятельный |
| 4 | innerText.length стабильность | ⭐⭐ | DOM | Fallback — ложные срабатывания при Agent Mode паузах |

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

**GLM детектор готовности:**
response.js
→ Fallback-цепочка: `.markdown-prose` → `[class*="prose"]` → `[data-message-role="assistant"]`

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
→ `scripts/progress-monitor.js` → `monitorProgress('glm')`
Вернёт: `{ thought, tools, textLen, mainText, done, spinner }`

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
response.js
4. VeAI: `write_file(target_path, result.text)` — сохранить текст как файл

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
→ `scripts/blob-download.js` → `blobDownload()`

Перехватывает `URL.createObjectURL` при клике Download, читает blob через FileReader.
Для текстовых файлов: `readAsDataURL` → `atob()` → содержимое.
Для бинарных: `readAsArrayBuffer` → `Uint8Array` → `btoa()` → base64.

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
Проверить/открыть по вкладке на провайдера. См. селекторы в таблице ниже.

**Шаг 3. Отправить вопрос параллельно**
→ `scripts/multi-provider.js` → `dispatchToAll(providers, question)`
⚠️ Отправлять БЫСТРО (без await генерации) — провайдеры генерируют параллельно!
Минимум 2 сек между отправками (rate limiting).

**Шаг 4. Собрать ответы**
→ `scripts/multi-provider.js` → `collectResponses(providers)`
response.js

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
→ `scripts/multi-provider.js` → `formatMultiPrompt(question, round, otherAnswers)`

### Таймауты для параллельного режима
| Кол-во провайдеров | Таймаут на раунд | Макс раундов |
|:------------------:|:-----------------:|:------------:|
| 1 | по режиму | — |
| 2 | 120 сек | 3 |
| 3 | 180 сек | 3 |

---

## 📎 Файлы

### Метод 1: Прямая загрузка (без кнопки "+") — рекомендуется
`page.locator('input[type="file"]').setInputFiles(absPath)` — GLM рендерит preview

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
`page.locator('button[class*="invisible"]').first().click()`

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

## 🛡️ Production Readiness (v14.0 — обновлено по анализу аналогов)

### Startup Health-Check
response.js + provider-adapter.js
Проверяет все селекторы + network hooks + session manager при инициализации.
Если селектор не найден → "Selector outdated for Provider X"
`browser_evaluate('window.__adapter.healthCheck()')`

### Anti-Bot защита
- **CloakBrowser** (рекомендуется) — stealth Chromium с 58 C++ патчами, 26K⭐
  `npm install cloakbrowser` → drop-in замена Playwright
- **playwright-extra** (fallback) — JS-level stealth патчи
  `npm install playwright-extra puppeteer-extra-plugin-stealth`
- **НЕ** использовать `page.fill()` — использовать human-like typing (50-150мс задержки)
- Рандомные паузы между запросами (2-5 сек)

### Network Interception (🆕 v14.0)
network-hooks.js — перехват fetch/EventSource на уровне страницы:
- SSE-токены буферизуются в `window.__netBuffer`
- Парсинг OpenAI-совместимого формата (choices[0].delta.content)
- Fallback на DOM если network buffer пуст
- Идемпотентная установка — безопасно вызывать многократно

### Session Persistence (🆕 v14.0)
session-manager.js — сохранение/восстановление сессии:
- `window.__session.save()` → JSON с cookies + localStorage + sessionStorage
- `window.__session.restore(data)` → восстановление из JSON
- `window.__session.status()` → проверка авторизации
- Валидация: проверка возраста сессии (< 7 дней)

### Provider Adapter (🆕 v14.0)
provider-adapter.js — унифицированный интерфейс:
- `observe()` — полная диагностика состояния страницы
- `send(text)` — отправка сообщения через human-like input
- `read()` — чтение ответа (network → DOM)
- `healthCheck()` — проверка всех систем

### Multi-tier Locators (fallback-цепочка)
response.js + provider-adapter.js
- GLM: `.markdown-prose` → `[class*="prose"]` → `[data-message-role="assistant"]`
- Qwen: `[class*="message-content"]` → `.markdown-body` → `[role="article"]`
- DeepSeek: `.ds-markdown` → `[class*="markdown"]` → `[role="article"]`
- При срабатывании fallback — console.warn для наблюдаемости

### Resource Management
- 3 персистентных контекста (по одному на провайдера) — НЕ создавать новый на запрос
- `browserContext.close()` при остановке MCP-сервера
- Мониторинг RAM: если вкладка >500MB → перезагрузить
- Network buffer ограничен 50 записями (автоочистка старых)

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
├── _meta.json                    ← машиночитаемый конфиг (единый источник версий)
├── reference.md                  ← техническая справка API провайдеров
├── scripts/                      ← JS-скрипты для browser_evaluate
│   ├── response.js               ← Response Detection + чтение + healthCheck (v14: network priority)
│   ├── hooks-auto-init.js        ← 🆕 Единая точка входа — auto-init hooks + trace + adapters
│   ├── network-hooks.js          ← 🆕 Network interception — перехват fetch/EventSource, SSE-буфер
│   ├── session-manager.js        ← 🆕 Session persistence — cookies + localStorage
│   ├── provider-adapter.js       ← 🆕 Унифицированный провайдер-агностик API
│   ├── provider-adapters.js      ← 🆕 IProviderAdapter + GLMAdapter + OpenAIAdapter + OpenAINormalizer
│   ├── cdp-intercept.js          ← 🆕 WebSocket interception — для WS-based провайдеров
│   ├── ai-extract.js             ← 🆕 AI-powered extract fallback — 5 стратегий
│   ├── debug-trace.js            ← 🆕 Debug tracing — логирование + ошибки + таймеры
│   ├── multi-collect.js          ← 🆕 Сбор ответов multi-provider (adapter → network → ai-extract → DOM)
│   ├── blob-download.js          ← Blob-перехват (текст + бинарные, try/finally)
│   └── progress-monitor.js       ← Мониторинг Agent Mode (v14: network-aware)
├── server/                       ← 🆕 OpenAI-compatible HTTP bridge + CloakBrowser MCP
│   ├── openai-bridge.js          ← Express + Playwright → /v1/chat/completions
│   ├── cloak-browser-mcp.js      ← 🆕 CloakBrowser MCP server (stdio JSON-RPC)
│   ├── package-cloak.json        ← CloakBrowser dependencies
│   └── README.md                 ← 🆕 Server documentation
├── package.json                 ← 🆕 Node.js dependencies (express, playwright)
├── plans/                        ← планы развития (анализ аналогов и т.д.)
├── log/                          ← логи чатов
└── test-results.md               ← результаты тестирования селекторов
```

### Как использовать скрипты
1. `read_file('scripts/<name>.js')` — прочитать содержимое
2. `browser_evaluate(<function_body>)` — выполнить нужную функцию в контексте страницы

### 🆕 Порядок инициализации (v14.0)
При первом обращении к провайдеру в сессии:
1. `browser_evaluate(filename='hooks-auto-init.js')` — 🆕 **Единая точка входа** — автоматически:
   - Устанавливает network hooks (fetch/EventSource перехват)
   - Инициализирует debug trace
   - Инициализирует адаптеры (если provider-adapters.js загружен)
2. `browser_evaluate(filename='provider-adapters.js')` — если нужны адаптеры (GLMAdapter/OpenAINormalizer)
3. `browser_evaluate(filename='provider-adapter.js')` — если нужен унифицированный API
4. `browser_evaluate(filename='session-manager.js')` — если нужна session persistence

После инициализации использовать:
- `browser_evaluate('window.__adapter.observe()')` — полная диагностика состояния
- `browser_evaluate('window.__adapter.read()')` — чтение ответа (adapter → network → DOM)
- `browser_evaluate('window.__adapter.healthCheck()')` — проверка всех систем
- `browser_evaluate('window.__currentAdapter.readFromBuffer()')` — чтение из буфера через адаптер
- `browser_evaluate('window.__currentAdapter.getAnswerText()')` — только answer-фаза
- `browser_evaluate('window.__currentAdapter.getThinkingText()')` — только thinking-фаза
- `browser_evaluate('new OpenAINormalizer().normalizeFull()')` — полный ответ в OpenAI SSE формате
- `browser_evaluate('new OpenAINormalizer().toCompletionResponse()')` — полный ответ как OpenAI JSON
- `browser_evaluate('window.__session.status()')` — статус авторизации
- `browser_evaluate('window.__netBuffer.stats()')` — статистика перехваченных запросов

### CloakBrowser (опционально, для stealth)
Если провайдер добавляет бот-детекцию, установите CloakBrowser:
```bash
npm install cloakbrowser playwright-core
```
Запуск MCP Playwright сервера с CloakBrowser:
```bash
npx @playwright/mcp --browser chromium  # CloakBrowser подхватится автоматически
```
CloakBrowser: 26K⭐, 58 C++ патчей, drop-in замена Playwright, проходит 30/30 бот-тестов.

### Репозиторий: https://github.com/donHenaro/glm-chat-mcp.git

---

## 📝 Примеры промптов (по рекомендациям GLM)

### Код-ревью (Java/Spring Boot)
```
[Код-ревью] Spring Boot сервис, проблема: N+1 в методе getOrders().
Вот сигнатура + проблемный метод:
```java
public List<OrderDTO> getOrders(Long customerId) {
  List<Order> orders = orderRepo.findByCustomerId(customerId);
  for (Order o : orders) { o.getItems().size(); } // lazy load
  return orders.stream().map(this::toDTO).toList();
}
```
Вопрос: как исправить N+1? Только проблемный метод, не весь файл.
```

### Анализ логов
```
[Анализ логов] Приложение падает с OOM каждые ~2 часа.
Вот сэмпл из 10 строк (из 500K) с ERROR + первые 5 строк stack trace:
```
2025-01-15 14:23:01 ERROR [pool-3] OutOfMemoryError: Java heap space
  at java.util.Arrays.copyOf(Arrays.java:3210)
  at com.example.service.CacheManager.put(CacheManager.java:45)
  ...
```
Гипотеза: memory leak в CacheManager. Подтверди или опровергни.
```

### Анализ PDF/DOCX
```
[PDF-анализ] Загружен файл с архитектурой системы (48 стр).
Дай: 1) Краткое содержание (5 предложений) 2) Ключевые компоненты 3) Потенциальные проблемы
Формат: markdown с заголовками.
```

### Мульти-консультация
```
[Всем] Какой подход лучше для rate limiting в Spring Boot:
A) Bucket4j B) Resilience4j C) Spring Cloud Gateway filters?
Ответ: 1) Твой выбор 2) Обоснование 3) Уровень уверенности (0-100%)
```

### Генерация файла через Agent Mode
```
Создай JSON-файл config.json с настройками Spring Boot приложения:
server.port=8080, spring.datasource.url=postgresql://localhost/mydb,
spring.jpa.hibernate.ddl-auto=validate.
Покажи файл для скачивания.
```

---

## 📋 Changelog

### v14.4.0 (current) — P3.1 Production Hardening
**P3.1 реализовано:**
- 🆕 API Authentication: Bearer token + query key (env API_KEYS)
- 🆕 Rate Limiting: per-key, X-RateLimit-* headers, 429 errors
- 🆕 Response Cache: in-memory, TTL 5 min, hash-based, eviction
- 🆕 Auto-Retry & Fallback: GLM↔DeepSeek cross-provider retry
- Env config: API_KEYS, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX, CACHE, CACHE_TTL

**Протестировано:**
- ✅ Auth disabled by default (no API_KEYS) — /v1/models returns 200
- ✅ Rate limiting inactive without auth
- ✅ Cache hit logic (hash + TTL + eviction)
- ✅ Fallback: GLM→DeepSeek, DeepSeek→GLM
- ✅ /v1/status: {version:'14.3.0', models:6}

### v14.3.0 — P2 Complete: CDP + CloakBrowser + WebSocket + Sessions
**P2 полностью реализовано:**
- 🆕 `server/cloak-browser-mcp.js` — CloakBrowser MCP server (stdio JSON-RPC)
  - 6 tools: navigate, click, type, evaluate, snapshot, press_key
  - Falls back to playwright if cloakbrowser not installed
  - Env config: CLOAK_HUMANIZE, CLOAK_PROXY, CLOAK_GEOIP
- 🆕 `server/package-cloak.json` — cloakbrowser + @anthropic-ai/sdk dependencies
- 🆕 `scripts/cdp-intercept.js` — WebSocket interception + EventSource fallback
  - Monkey-patches WebSocket for incoming/outgoing message capture
  - `window.__wsBuffer.extractResponse()` for chat response extraction
  - Supports SSE-over-WebSocket and JSON-over-WebSocket formats
- `server/openai-bridge.js` v14.3:
  - CDP auto-discovery (scans localhost:9222-9223 for existing Playwright)
  - Session management: X-Session-Id header, 30-min TTL, page reuse
  - New endpoints: GET /v1/status, GET /v1/sessions
  - CloakBrowser mode: CLOAK=true env var
  - Conversation context reuse (don't re-navigate if on same domain)

**Протестировано:**
- ✅ fetch-stream via tee() работает на свежей вкладке
- ✅ Network detection быстрее DOM (phase=complete while DOM spinner)
- ✅ OpenAI completion: {content:"Париж", reasoning_content:"...", finish_reason:"stop"}
- ✅ /v1/models endpoint: 6 моделей
- ✅ Full pipeline: HTTP request → GLM chat → SSE → network buffer → OpenAI format

### v14.2.0 — Network Intelligence + AI Extract + OpenAI Bridge
**P1 полностью реализовано:**
- 🆕 `hooks-auto-init.js` — единая точка входа, auto-init hooks + trace + adapters
- 🆕 `ai-extract.js` — AI-powered extract fallback (5 стратегий: network → selectors → roles → containers → longest-prose)
- 🆕 `multi-collect.js` — сбор ответов multi-provider (adapter → network → ai-extract → DOM)
- `progress-monitor.js` v14: network-aware monitoring (phase, progress%, ETA, netDone)
- `multi-provider.js` v14: использует adapter.send() когда доступен

**P2 частично реализовано:**
- 🆕 `server/openai-bridge.js` — OpenAI-compatible HTTP bridge (Express + Playwright)
- 🆕 `package.json` — Node.js зависимости (express, playwright)
- Models: glm-5.1, glm-5, glm-4, qwen3, deepseek, deepseek-chat
- Endpoints: GET /v1/models, POST /v1/chat/completions (stream/non-stream)
- CDP connection: поддержка подключения к существующему браузеру

**Протестировано:**
- ✅ fetch-stream через tee() работает на свежей вкладке
- ✅ answerText="Париж" для "столица Франции" — network detection быстрее DOM
- ✅ progress-monitor: phase=complete, source=network (DOM ещё spinner!)
- ✅ OpenAI completion response: {content:"Париж", reasoning_content:"...", finish_reason:"stop"}
- ✅ OpenAI /v1/models endpoint: 6 моделей
- ✅ Полный пайплайн: HTTP request → GLM chat → SSE → network buffer → OpenAI format

### v14.0.0 — Network Intelligence Edition
**По анализу аналогов (Chat2API, WebModel, CloakBrowser, Stagehand, Steel.dev):**
- 🆕 `hooks-auto-init.js` — единая точка входа, auto-init hooks + trace + adapters
- 🆕 `network-hooks.js` — перехват fetch/EventSource, SSE-буфер, парсинг токенов
- 🆕 `session-manager.js` — persistent sessions через cookies/localStorage
- 🆕 `provider-adapter.js` — унифицированный провайдер-агностик API (observe/send/read)
- 🆕 `provider-adapters.js` — IProviderAdapter + GLMAdapter + OpenAIAdapter + OpenAINormalizer
- 🆕 `debug-trace.js` — логирование действий + ошибки + таймеры
- `response.js` v14: network buffer как приоритетный источник перед DOM-селекторами
- `response.js` v14: healthCheck() теперь проверяет network hooks + session manager
- `extractLastResponse()` возвращает `source: 'adapter'|'network'|'dom'`
- SKILL.md: обновлена иерархия надёжности (network buffer = приоритет 0)
- SKILL.md: добавлен раздел CloakBrowser (опциональный stealth)
- SKILL.md: hooks-auto-init.js как единая точка входа
- Анализ аналогов: `plans/Аналоги_glm-chat-mcp_и_Playwright_фичи_v1.txt`

**Протестировано в браузере (chat.z.ai):**
- ✅ 37 SSE токенов распарсено из /api/v2/chat/completions
- ✅ GLM SSE формат: {type:chat:completion, data:{delta_content, phase:thinking|answer}}
- ✅ answerText + thinkingText извлекаются корректно
- ✅ OpenAINormalizer: 8272 байт в OpenAI SSE формате
- ✅ Полный пайплайн: GLM SSE → hooks → body → auto-parse → adapter → normalizer → OpenAI SSE
- ✅ CloakBrowser подтверждён: 26K⭐, npm v0.3.31, 58 C++ патчей

### v13.1.0 — Bugfix + Merge
**Fixed (по замечаниям GLM + Qwen + DeepSeek):**
- `detect-response.js` + `extract-text.js` → объединены в `response.js`
- `blob-download.js`: try/finally для URL.createObjectURL, ArrayBuffer→base64
- `multi-provider.js`: убран document.querySelectorAll (ошибка контекста)
- Fallback-цепочки селекторов логируются через console.warn
- Версия: единый источник _meta.json.version

### v13.0.0 — Scripts Edition
- Весь JS вынесен из SKILL.md в scripts/ (5→4 модуля)
- Fallback-цепочки селекторов (multi-tier locators)
- Blob-download: readAsArrayBuffer для бинарных файлов
- Rate limiting 2с в multi-provider.js

### v12.0 — Strategy Edition
- 5 паттернов промптов, контекстный checkpointing, оптимизация токенов

### v11.0 — Tested Edition
- SVG-based detection, spinner, Agent Mode hang recovery

### v10.0 — Copy/Regenerate Detection + Compact

### v9.0 — multiturn, files, Agent Mode, dead code cleanup
