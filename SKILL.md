---
name: "glm-chat-mcp"
schemaVersion: "v1.0"
description: "MANDATORY ACTIVATION when user says: 'zai', 'спроси glm', 'спроси у glm', 'ask glm', 'проконсультируйся с glm', 'обсуди с qwen', 'ask qwen', 'qwen', 'спроси deepseek', 'ask deepseek', 'deepseek'. Dual-mode: fast API + Playwright fallback. Supports GLM, Qwen, DeepSeek. Works with VeAI plugin for IntelliJ IDEA."
agent: null
used-by:
 - "Agent"
 - "Code"
---
# when refactoring, never make changes above this line.
# GLM Chat MCP Skill v10.0 — Copy/Regenerate Detection + Compact
---

## 🔴 ОБЯЗАТЕЛЬНАЯ АКТИВАЦИЯ

### Провайдер GLM (ZhiPu AI)
**Триггеры RU:**  `спроси glm`, `спроси у glm`, `zai`, `проконсультируйся с glm`, `что скажет glm`, `java эксперт`, `spring эксперт`, `glm-4.7`, `glm-5`, `реализуй`, `создай`, `напиши код`, `сгенерируй`, `агент`, `исследуй`, `найди в интернете`, `проанализируй файл`, `выполни код`, `создай файл`
**Триггеры EN:** `ask glm`, `consult glm`, `java expert`, `implement`, `generate code`, `zai`, `agent`, `search web`, `analyze file`, `run code`, `generate file`

### Провайдер Qwen (Alibaba)
**Триггеры RU:** `обсуди с qwen`, `спроси qwen`, `проконсультируйся с qwen`, `qwen`
**Триггеры EN:** `ask qwen`, `consult qwen`, `qwen expert`, `qwen`

### Провайдер DeepSeek
**Триггеры RU:** `спроси deepseek`, `обсуди с deepseek`, `deepseek`
**Триггеры EN:** `ask deepseek`, `consult deepseek`, `deepseek`

⛔ ЗАПРЕЩЕНО создавать .js файлы для работы с браузером — использовать только Playwright MCP инструменты напрямую
⛔ ЗАПРЕЩЕНО закрывать браузер после консультации
⛔ ЗАПРЕЩЕНО пробовать один и тот же элемент повторно если он уже сработал
✅ Браузер и чат уже открыты — сначала проверить текущее состояние, не переоткрывать без причины

---

## 🏛️ АРХИТЕКТУРА: API-first + Playwright Fallback

Агент работает с чатами **двумя путями**, выбирая оптимальный автоматически:

```
┌──────────────────────────────────────────────────────┐
│                   MODE ROUTER                         │
│                                                       │
│  Все провайдеры → API (primary, быстрый)              │
│                   ↓ при ошибке API                    │
│                   Playwright (fallback, полный UI)     │
└──────────────────────────────────────────────────────┘
```

### API-режим (primary) — быстрый путь

Агент делает **прямые HTTP-запросы** к backend API провайдеров через `browser_evaluate` с `fetch()`.
Токены берутся **из текущей сессии браузера** (cookies/localStorage) — не нужны отдельные аккаунт-пулы.

**Преимущества:**
- ⚡ **10-30 сек быстрее** — нет рендеринга UI, нет polling snapshot
- 🎯 **Точный ответ** — JSON вместо парсинга accessibility tree
- 🔄 **Стриминг** — чтение ответа по частям через SSE
- 📊 **Метаданные** — usage, model, finish_reason

### Playwright-режим (fallback) — полный UI

Когда API недоступен или нужны UI-специфичные функции:
- 📎 Загрузка/скачивание файлов
- 🖼️ Vision с UI-interaction
- 🔄 Первичная авторизация (получение токенов)
- 🛡️ Обход Cloudflare/bot-детекции

---

## 🔑 Получение токенов из сессии браузера

Перед первым API-запросом в сессии — извлечь токены из браузера.

### GLM — извлечение токенов

```javascript
// Выполнить через browser_evaluate на вкладке chat.z.ai
const tokens = await (async () => {
  // JWT из localStorage
  const token = localStorage.getItem('token') || localStorage.getItem('zai_token');
  // User ID из localStorage
  const userId = localStorage.getItem('user_id') || localStorage.getItem('userId');
  // Chat ID из URL
  const chatId = window.location.pathname.match(/\/c\/([a-f0-9-]+)/)?.[1] || '';
  return { token, userId, chatId };
})();
```

### Qwen — извлечение токенов

```javascript
// Выполнить через browser_evaluate на вкладке chat.qwen.ai
const tokens = await (async () => {
  const token = localStorage.getItem('token') || document.cookie.match(/token=([^;]+)/)?.[1];
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  return { token, csrf };
})();
```

### DeepSeek — извлечение токенов

```javascript
// Выполнить через browser_evaluate на вкладке chat.deepseek.com
const tokens = await (async () => {
  const token = localStorage.getItem('token') || document.cookie.match(/session_token=([^;]+)/)?.[1];
  return { token };
})();
```

⛔ Эти сниппеты — **шаблоны**. Агент может адаптировать их под реальный DOM.
✅ Токены кешируются в памяти агента на время сессии.

---

## ⚡ API-режим: три стратегии доступа

### Стратегия: UI-отправка + Copy/Regenerate Detection

**Все 3 провайдера** используют защитные механизмы (X-Signature, PoW, Message Tree),
поэтому прямой API **не рекомендуется**. Вместо этого:

**Отправка:** через UI (textarea + Enter) — подписи и PoW обрабатываются автоматически
**Чтение:** двухфазный детектор — Stop → Copy/Regenerate

**Фаза 1 (0-15 сек):** Ждём появления Stop → генерация началась
**Фаза 2 (до timeout):** Ждём Copy/Regenerate (стабильны 3 сек) → генерация завершена

**Иерархия надёжности детекции (по данным GLM):**
| Приоритет | Индикатор | Надёжность |
|:---------:|-----------|:----------:|
| 🥇 1 | Кнопки Copy / Regenerate | ⭐⭐⭐⭐⭐ |
| 🥈 2 | Исчезновение Stop | ⭐⭐⭐⭐ |
| 🥉 3 | Исчезновение thinking | ⭐⭐⭐ |
| 4 | innerText.length стабильность | ⭐⭐ (fallback) |

**Таймауты по режиму:**
| Режим | Таймаут | Обычно |
|-------|---------|--------|
| Chat Mode | 60 сек | 5-15 сек |
| Deep Think | 120 сек | 30-90 сек |
| Agent Mode | 300 сек | 1-5 мин |

**Чтение ответа:** после завершения — `browser_evaluate`:
```javascript
const msgs = document.querySelectorAll('.chat-assistant .markdown-prose');
const text = msgs[msgs.length - 1]?.innerText || '';
```

⚠️ Agent Mode: между tool calls кнопки Copy/Regenerate могут мигнуть и исчезнуть.
Подождать 3 сек и перепроверить — если стабильны → ответ готов.

SSE-intercept доступен как альтернатива для streaming (см. [reference.md](reference.md))

---

### Техническая справка → [reference.md](reference.md)

Детальная информация по API (эндпоинты, заголовки, SSE-форматы, токены) вынесена в отдельный файл.
В SKILL.md — только workflow и инструкции для агента.

---

### Qwen API
⚠️ Прямой API сложен (message tree). Через UI-отправку + Copy/Regenerate detection.
Модели: `qwen3.7-plus`, `qwen3.7-max`, `qwq-32b` | См. [reference.md](reference.md)

---

### DeepSeek API
⚠️ PoW challenge перед каждым запросом. Через UI-отправку + Copy/Regenerate detection.
Модели: `deepseek-chat`, `deepseek-reasoner` | См. [reference.md](reference.md)

---



## 🔄 Workflow — Универсальный для всех провайдеров

### Шаг 0. Определить провайдера и режим

| Триггер | Провайдер | Default Mode |
|---------|-----------|-------------|
| `glm`, `zai` | GLM | Chat (5-15 сек) |
| `qwen` | Qwen | Chat |
| `deepseek` | DeepSeek | Chat |
| Не указан | GLM | Chat |

**Agent Mode триггеры:** `найди`, `проанализируй`, `выполни код`, `исследуй`, `agent`, `web search`

### Шаг 1. Проверить лог и найти существующий чат

Открыть `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`.
Если найден чат по теме — перейти через `browser_navigate` на URL чата.

### Шаг 2. Переключиться на нужную вкладку

| Провайдер | URL |
|-----------|-----|
| GLM | `https://chat.z.ai/c/<UUID>` |
| Qwen | `https://chat.qwen.ai/c/<UUID>` |
| DeepSeek | `https://chat.deepseek.com/a/chat/s/<UUID>` |

Если вкладка не открыта — `browser_navigate` на URL провайдера.

### Шаг 3. Выбрать режим (при необходимости)

`browser_snapshot` → найти кнопку режима → `browser_click`

| GLM | Qwen | DeepSeek |
|-----|------|----------|
| Agent, Deep Think, Web Search | Search toggle, Model select | DeepThink toggle |

### Шаг 4. Отправить сообщение

`browser_click` на textarea → `browser_type` текст → `browser_press_key` Enter

### Шаг 5. Ожидание ответа — двухфазный детектор

**Фаза 1:** Ждём Stop button (0-15 сек) — генерация началась
**Фаза 2:** Ждём Copy/Regenerate (до timeout) — генерация завершена

| Режим | Таймаут Фазы 2 |
|-------|----------------|
| Chat | 60 сек |
| Deep Think | 120 сек |
| Agent Mode | 300 сек |

⚠️ В Agent Mode: после первого появления Copy — подождать 3 сек и перепроверить (кнопки могут мигнуть между tool calls).

### Шаг 6. Прочитать ответ

`browser_evaluate` — извлечь текст из DOM:
```javascript
// GLM
const msgs = document.querySelectorAll('.chat-assistant .markdown-prose');
const text = msgs[msgs.length - 1]?.innerText || '';
```

### Шаг 7. Записать лог

`log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`

Сохранить в `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`

---

## 🎮 Элементы управления (Playwright fallback)

Все элементы ищутся в accessibility tree через `browser_snapshot`.

### Общие (все провайдеры):
**Поле ввода** — textarea или role=textbox
**Кнопка Send** — button "Send"
**Кнопка Stop** — button "Stop" (видна пока генерирует)
**New Chat** — button "New Chat"

### GLM-специфичные:
**Переключатель модели** — button "GLM-5.1", "GLM-5", "GLM-5-Turbo", "GLM-4.7"
**Agent Mode** — button "Agent"
**Deep Think** — button "Deep think"
**Web Search** — в меню "+" пункт "Search" / "联网搜索"

### Qwen-специфичные:
**Переключатель модели** — button "Qwen3" или выпадающий список
**Web Search** — toggle button / checkbox
**Кнопки после ответа** — "Copy", "Regenerate"

### DeepSeek-специфичные:
**DeepThink (R1)** — button "DeepThink" или toggle
**Search** — toggle для веб-поиска

---

## ⏳ Ожидание ответа

### API-режим
**Нестримящий:** ответ сразу в JSON
**Стримящий:** читать SSE chunks до `data: [DONE]` или `finish_reason: "stop"`

### Playwright-режим
**ЖДАТЬ:** пока кнопка Stop видна в snapshot
**ГОТОВО:** Stop исчез, появились Copy/Regenerate
**Таймаут:** 3 минуты, snapshot каждые 10-15 сек

---

## 🤖 Режимы провайдеров

### GLM режимы

| Режим | features-параметр | Playwright UI |
|-------|-------------------|---------------|
| Обычный | `web_search:false, auto_web_search:false` | без режима |
| Deep Think | `enable_thinking:true` + `reasoning_effort:"high"` | кнопка "Deep think" |
| Agent Mode | `flags:["general_agent"]` + `reasoning_effort:"max"` | кнопка "Agent" |
| Web Search | `web_search:true` или `auto_web_search:true` | меню "+" → "Search" |

### Qwen режимы

| Режим | feature_config | Playwright UI |
|-------|----------------|---------------|
| Обычный | `thinking_enabled:false, auto_search:false` | без режима |
| Web Search | `auto_search:true` | toggle Web Search |
| Deep Think | `thinking_enabled:true, thinking_mode:"Deep"` | выбор модели qwq |

### DeepSeek режимы

| Режим | UI-действие |
|-------|------------|
| Обычный | без режима |
| Deep Think (R1) | кнопка "DeepThink" toggle |
| Search | кнопка "Search" toggle |

### Автоматический выбор режима

| Тип запроса | Режим |
|-------------|-------|
| "найди", "актуальная версия", "документация" | Web Search |
| "архитектура", "рефакторинг", "паттерн" | Deep Think |
| "сгенерируй", "создай код", "implement" | Agent Mode (GLM) / без режима |
| "подумай", "reasoning" | Deep Think / Reasoner |
| Всё остальное | без режима |

---

## 🔄 Мультитурновые диалоги (продолжение чата)

**Все три провайдера хранят контекст на сервере.** Для продолжения диалога —
просто оставаться на том же URL чата и отправлять следующее сообщение.

### GLM: продолжение
URL содержит chat_id: `chat.z.ai/c/<uuid>` — отправка в тот же чат = продолжение контекста.

### Qwen: продолжение  
URL содержит chat_id: `chat.qwen.ai/c/<uuid>` — аналогично.

### DeepSeek: продолжение
URL содержит session_id: `chat.deepseek.com/a/chat/s/<uuid>` — аналогично.

### Правила мультитурна:
1. ✅ **НЕ создавать новый чат** если пользователь продолжает ту же тему
2. ✅ Оставаться на текущем URL — просто отправить следующее сообщение в textarea
3. ✅ Проверить: если URL содержит UUID чата — мы в существующем диалоге
4. ⚠️ Новый чат создавать ТОЛЬКО когда пользователь явно просит ("новый чат", "new chat") или тема кардинально меняется
5. ✅ При мультитурне — SSE-перехватчик работает без переустановки

---

## 📎 Файлы — загрузка в чат

### GLM — загрузка файлов
1. Нажать кнопку "+" рядом с полем ввода
2. В открывшемся меню выбрать "Upload" / "Загрузить"
3. `browser_upload_file` — передать путь к файлу
4. Файл отобразится как вложение в поле ввода
5. Отправить сообщение — файл будет обработан вместе с текстом

**Поддерживаемые форматы:** `.pdf`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.md`, `.py`, `.bmp`, `.gif`, `.mp4`
**Конвертировать в `.txt`:** `.java`, `.js`, `.ts`, `.kt`, `.scala`, `.go`, `.rs`, `.cpp`, `.cs`

### Qwen — загрузка файлов
Аналогично GLM — кнопка "Upload" / вложения в поле ввода.

### DeepSeek — программная загрузка через DataTransfer API
DeepSeek позволяет загружать файлы программно через `browser_evaluate`:
```javascript
// На вкладке DeepSeek
const fileInput = document.querySelector('input[type="file"]');
if (fileInput) {
  const dataTransfer = new DataTransfer();
  // Для текстовых файлов:
  const file = new File([content], 'filename.txt', { type: 'text/plain' });
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}
```
**Поддерживаемые форматы:** PDF, TXT, CSV, JSON, Python, XLSX, JPEG, PNG, BMP
**Лимит:** до 50 файлов, макс 100-500 MB

---

## 📋 Лог чатов

Лог: `log/YYYY-MM-DD/`
- GLM: `glm-chat-log-YYYY-MM-DD.md`
- Qwen: `qwen-chat-log-YYYY-MM-DD.md`
- DeepSeek: `deepseek-chat-log-YYYY-MM-DD.md`

### Формат записи:
```
| [дата] | [время] | [UUID] | [тема] | [URL] | [провайдер] | [API|PW] | ✅ |
```

---

## 📋 Протокол диалога

```
ЭТАП 1: Сбор контекста
ЭТАП 2: Определить провайдера и режим
ЭТАП 3: Установить SSE-перехватчик (если нет)
ЭТАП 4: Отправить сообщение через UI (textarea + Enter)
ЭТАП 5: Прочитать ответ (SSE chunks / DOM innerText)
         ↓ при ошибке
         Playwright snapshot fallback
ЭТАП 6: Обработать ответ, записать лог
```

---

## ❌ Обработка ошибок

| Ситуация | Действие |
|----------|----------|
| Токены не найдены | Зайти на сайт провайдера, залогиниться вручную |
| API 401/403 | Обновить токены, retry; если не помогло — Playwright |
| API 429 | Подождать 30с, retry; при повторе — Playwright |
| API timeout | Retry 1 раз, затем Playwright |
| Playwright: элемент не найден | Ещё один snapshot |
| Playwright: браузер закрыт | Перейти на URL провайдера |
| GLM rate limit (300/day) | Переключиться на другую модель или Playwright |

⛔ НЕ писать "попробую другой подход" и не создавать JS-файлы.
✅ Сообщить пользователю точно что не получается.

---

## 🤖 GLM Agent Mode — расширенные возможности

GLM Agent Mode — **автономный агент с доступом к инструментам**.
В отличие от обычного чата (Chat Mode), Agent Mode:
- **Chat Mode:** быстро (5-15 сек), один шаг, генерация текста
- **Agent Mode:** медленно (1-5 мин), многошаговый, выполнение действий с инструментами

Agent Mode **составляет план** и **пошагово выполняет** — ответ формируется качественно, но очень долго.
Если нужен простой и быстрый ответ — используй **Chat Mode**.

### Встроенные инструменты Agent Mode:

| Инструмент | Описание | Примеры |
|------------|----------|:-------:|
| **web_search** | Поиск в интернете, чтение веб-страниц | Документация, GitHub issues, StackOverflow |
| **code_execution** | Выполнение Python кода в sandbox | Валидация алгоритмов, httpx-запросы |
| **browser_automation** | Управление браузером, навигация | Открытие URL, чтение страниц |
| **file_operations** | Чтение/создание файлов в sandbox | Обработка файлов, генерация результатов |
| **mcp_servers** | Подключение к внешним MCP-серверам | Расширение возможностей |

### Активация Agent Mode:
- **UI:** Нажать кнопку "Agent" в GLM чате
- **Параметры API:** `flags:["general_agent"]` + `reasoning_effort:"max"`

### Сценарии использования в скилле:

#### 1. 🔍 Исследование и документация
```
Пользователь: "Найди актуальную документацию по Spring Boot 3.5"
VeAI → GLM Agent Mode: web_search → browser_automation → чтение страниц → ответ
```
GLM Agent ищет, читает найденные страницы, извлекает релевантную информацию.
Возвращает ответ с источниками и ссылками.

#### 2. 📄 Анализ файлов
```
Пользователь: "Проанализируй этот PDF/DOCX/XLSX файл"
VeAI → загрузить файл через UI → GLM Agent Mode: file_operations + Vision → анализ
```
- Форматы: .pdf, .docx, .xlsx, .pptx, .txt, .md, .py, изображения
- Может извлечь данные, выполнить вычисления (code_execution), вернуть отчёт

#### 3. 🧪 Выполнение и валидация кода
```
Пользователь: "Проверь этот алгоритм на больших данных"
VeAI → GLM Agent Mode: code_execution → запуск → анализ результатов
```
- Python sandbox с httpx, pandas, numpy (по возможности)
- Полезно для валидации алгоритмов, вычислений, преобразований

#### 4. 📥 Генерация файлов
```
Пользователь: "Сгенерируй SQL-схему"
VeAI → GLM Agent Mode: file_operations → создать файл → ссылка на скачивание
```

#### 5. ⛓️ Автоматизированные цепочки
```
Пользователь: "Найди баг → воспроизведи → предложи исправление"
VeAI → GLM Agent Mode: multi-step agent loop
  1. web_search → найти причину
  2. code_execution → воспроизвести
  3. file_operations → создать патч
  4. Вернуть результат
```

### ⚠️ Критическое: Agent Mode и beforeunload

Agent Mode может вызывать `browser_automation` — навигацию на другие сайты.
Это вызывает **beforeunload** диалог, который **блокирует Playwright**.

**Решения:**
1. ✅ Использовать **Copy/Regenerate detection** (не патчим fetch)
2. ✅ Проверять URL перед чтением ответа — если GLM ушёл, вернуться назад
3. ❌ Не патчить fetch при Agent Mode — beforeunload блокирует Playwright
  3. file_operations: создать исправленный файл
  4. Вернуть патч пользователю
```

### Рекомендации по использованию:

| Ситуация | Режим | Причина |
|----------|-------|--------|
| Простой вопрос / код-ревью | Chat Mode | Быстро (5-15 сек) |
| Нужен веб-поиск | Agent Mode | web_search доступен только в Agent |
| Анализ файла | Agent Mode | Нужны file_operations + Vision |
| Выполнить код | Agent Mode | code_execution только в Agent |
| Многошаговая задача | Agent Mode | Agent loop с tools |
| Генерация файла | Agent Mode | file_operations для создания |

### Ограничения Agent Mode:
- ⏱️ **Медленный** — 1-5 минут (составляет план, пошагово выполняет)
- 🔒 **Sandbox** — code_execution изолирован, нет доступа к ФС пользователя
- 🌐 **Нет прямого HTTP** — только web_search и browser_automation
- 📦 **Нет git** — нельзя клонировать репозитории, создавать коммиты
- ⏰ **Таймаут** — agent loop ограничен (~5 минут)
- 🔄 **beforeunload** — browser_automation может заблокировать Playwright

### Agent Mode и VeAI оркестрация:

VeAI агент решает, когда направить задачу в GLM Agent Mode:
```
VeAI (оркестратор)
  ├→ GLM Chat Mode — быстрые ответы, код-ревью (5-15 сек)
  ├→ GLM Agent Mode — веб-поиск, анализ файлов, код (1-5 мин)
  ├→ Qwen — альтернативное мнение, китайская документация
  └→ DeepSeek — reasoning задачи, R1
```

Триггеры для Agent Mode:
- `найди в интернете`, `search web`, `актуальная информация`
- `проанализируй файл`, `analyze file`
- `выполни код`, `run code`, `протестируй`
- `создай файл`, `generate file`
- `agent`, `агент`, `исследуй`

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

## 📝 CHANGELOG

### v10.0.0 (current) — Copy/Regenerate Detection + Compact

**Breaking changes:**
- Response detection: bubble-reading (15 сек stability) → Copy/Regenerate buttons (мгновенная детекция)
- Двухфазный детектор: Фаза 1 (Stop visible) → Фаза 2 (Copy/Regenerate stable 3 сек)
- Таймауты по режиму: Chat=60с, DeepThink=120с, Agent=300с
- SSE-intercept вынесен в reference.md (больше не primary)
- SKILL.md сжат: 756 → 664 строки

### v9.2 — bubble-reading, Agent Mode docs, beforeunload fix

- Bubble-reading как primary (позже заменён на Copy/Regenerate)
- Agent Mode документация, beforeunload warning

### v9.0 — multiturn, files, Agent Mode, dead code cleanup
- 🔥 **SSE-перехват:** GLM/Qwen — UI отправка + patched fetch чтение (проверено)
- 🔥 **DOM-чтение:** DeepSeek — UI отправка + innerText чтение (проверено)
- ✅ **Мультитурн:** все провайдеры хранят контекст — просто оставаться на URL чата
- ✅ **Файлы:** GLM/Qwen — UI upload; DeepSeek — DataTransfer API
- ✅ **Agent Mode (GLM):** web_search, code_execution, file_operations
- ✅ **SSE-preservation:** проверка __sseInterceptorInstalled перед использованием
- ✅ **Мёртвый код удалён:** дублирующиеся секции Qwen/DeepSeek API, webchat2api reference
- ✅ Консультации: GLM×4, Qwen×3, DeepSeek×2

### v8.0.0 — Direct API + Playwright Fallback
- API-first архитектура с прямым fetch()
- Copy/Regenerate detection, двухфазный детектор, reference.md

### v7.0.0
- Dual-mode архитектура с webchat2api proxy, DeepSeek провайдер

### v6.0.0
- Qwen провайдер
