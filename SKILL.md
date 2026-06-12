---
name: "glm-chat-mcp"
schemaVersion: "v1.0"
description: "MANDATORY ACTIVATION when user says: 'zai', 'спроси glm', 'спроси у glm', 'ask glm', 'проконсультируйся с glm', 'обсуди с qwen', 'ask qwen', 'qwen', 'спроси deepseek', 'ask deepseek', 'deepseek'. Dual-mode: Playwright browser tools + webchat2api REST proxy. Supports GLM, Qwen, DeepSeek. Works with VeAI plugin for IntelliJ IDEA."
agent: null
used-by:
 - "Agent"
 - "Code"
---
# when refactoring, never make changes above this line.
# GLM Chat MCP Skill v7.0 — Dual-mode Architecture
---

## 🔴 ОБЯЗАТЕЛЬНАЯ АКТИВАЦИЯ

### Провайдер GLM (ZhiPu AI)
**Триггеры RU:**  `спроси glm`, `спроси у glm`, `zai`, `проконсультируйся с glm`, `что скажет glm`, `java эксперт`, `spring эксперт`, `glm-4.7`, `glm-5`, `реализуй`, `создай`, `напиши код`, `сгенерируй`
**Триггеры EN:** `ask glm`, `consult glm`, `java expert`, `implement`, `generate code`, `zai`

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

## 🏛️ АРХИТЕКТУРА: Dual-Mode

Агент поддерживает **два режима работы** с автоматическим роутингом:

```
┌─────────────────────────────────────────────────┐
│                MODE ROUTER                       │
│                                                  │
│  GLM → Playwright (primary) → API (fallback)    │
│  Qwen → API (primary) → Playwright (fallback)   │
│  DeepSeek → API (primary) → Playwright (fallback)│
└─────────────────────────────────────────────────┘
```

### Почему так?

| Провайдер | Primary | Причина |
|-----------|---------|---------|
| GLM | **Playwright** | UI активно эволюционирует (Deep Think, Agent Mode, Art), cookie-сессии с нестандартным refresh, Agent Mode = сложная оркестрация tool-calls |
| Qwen | **API** | Стабильный SSE endpoint (`/api/v1/chat/completions`), нет Cloudflare, токены живут долго |
| DeepSeek | **API** | Стандартный SSE endpoint (`/api/v0/chat/completions`), нет веб-поиска (проще), токены стабильнее |

### Fallback-цепочка

```
GLM:      Playwright → API (при 3+ timeout/browser crash)
Qwen:     API → Playwright (при 401/403 + failed refresh)
DeepSeek: API → Playwright (при 401/403 + failed refresh)
```

---

## 🔧 Конфигурация webchat2api

### Переменные окружения (агент читает из среды VeAI)

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `WEBCHAT2API_URL` | `http://localhost:83` | URL инстанса webchat2api |
| `WEBCHAT2API_KEY` | `admin` | API ключ (LOGIN_SECRET) |

### Health check

Перед использованием API-режима — проверить доступность:
```
GET {WEBCHAT2API_URL}/health
→ {"status": "ok"} — API доступен
→ timeout/error — переключиться на Playwright
```

### Когда использовать API-режим

- webchat2api работает и health check прошёл
- Нужна скорость (API быстрее на 5-15 сек)
- Нужен стриминг или мультитурновый диалог
- Работа с моделями, которые есть в webchat2api

### Когда использовать Playwright-режим

- webchat2api недоступен или health check падает
- GLM: нужны Agent Mode, Deep Think, Web Search (пока не в API)
- GLM: нужна загрузка/скачивание файлов
- Qwen/DeepSeek: API вернул 401/403 и refresh не помог
- Впервые за сессию — нужна авторизация в браузере

---

## ⚡ ИНСТРУМЕНТЫ

### Playwright MCP (для UI-автоматизации)
- `browser_snapshot` — текущее состояние страницы
- `browser_navigate` — переход по URL
- `browser_click` — клик по элементу
- `browser_type` — ввод текста
- `browser_press_key` — нажатие клавиши
- `browser_evaluate` — выполнение JS
- `browser_take_screenshot` — скриншот
- `browser_upload_file` — загрузка файла
- `browser_wait_for` — ожидание условия

### HTTP (для API-режима через webchat2api)

Агент использует `browser_evaluate` или `run_command` для HTTP-запросов к webchat2api:

**Чат-комплишн:**
```
POST {WEBCHAT2API_URL}/v1/chat/completions
Headers: Authorization: Bearer {WEBCHAT2API_KEY}
Body: { "model": "glm-5.1", "messages": [...] }
```

**Список моделей:**
```
GET {WEBCHAT2API_URL}/v1/models
Headers: Authorization: Bearer {WEBCHAT2API_KEY}
```

⛔ НЕ создавать файлы `*.js`, `*.ts`, `*.sh` для HTTP-запросов.
✅ Использовать `browser_evaluate` с `fetch()` или `run_command` с `curl`.

---

## 🔄 Workflow — Пошаговые действия

### Шаг 0. Определить провайдера и режим

| Триггер содержит | Провайдер | Primary Mode |
|-------------------|-----------|-------------|
| `glm`, `zai` | GLM | Playwright |
| `qwen` | Qwen | API → Playwright fallback |
| `deepseek` | DeepSeek | API → Playwright fallback |
| Не указан | GLM | Playwright |

Если провайдер = Qwen или DeepSeek → **сначала попробовать API-режим**.

### Шаг 1a. API-режим (Qwen / DeepSeek primary)

1. Проверить `GET {WEBCHAT2API_URL}/health`
2. Если `ok` → отправить запрос `POST /v1/chat/completions`
3. Если ошибка/timeout → перейти к Playwright-режиму (Шаг 1b)

**API-запрос:**
```json
{
  "model": "<модель провайдера>",
  "messages": [
    {"role": "system", "content": "<контекст задачи>"},
    {"role": "user", "content": "<запрос пользователя>"}
  ],
  "stream": false
}
```

**Маппинг моделей:**
| Запрос | API модель |
|--------|-----------|
| Qwen (по умолчанию) | `qwen-max-latest` |
| Qwen reasoning | `qwq-32b` |
| Qwen code | `qwen2.5-coder-32b-instruct` |
| Qwen + web search | `qwen-max-latest` + `extra_body.enable_search: true` |
| DeepSeek (по умолчанию) | `deepseek-chat` |
| DeepSeek reasoning | `deepseek-reasoner` |

### Шаг 1b. Playwright-режим (GLM primary / fallback)

Вызвать `browser_snapshot`. По результату определить провайдера и состояние:

#### Для GLM:
- URL содержит `chat.z.ai/c/[UUID]` → уже в чате GLM
- URL = `https://chat.z.ai/` → пустой новый чат GLM
- Другой URL или браузер закрыт → перейти на `https://chat.z.ai/`

#### Для Qwen:
- URL содержит `chat.qwen.ai/c/[UUID]` → уже в чате Qwen
- URL = `https://chat.qwen.ai/` → пустой новый чат Qwen
- Другой URL или браузер закрыт → перейти на `https://chat.qwen.ai/`

#### Для DeepSeek:
- URL содержит `chat.deepseek.com/a/chat/s/` → уже в чате DeepSeek
- URL = `https://chat.deepseek.com/` → пустой новый чат DeepSeek
- Другой URL или браузер закрыт → перейти на `https://chat.deepseek.com/`

Если поле ввода видно и чат открыт — **не делать лишних навигаций**.

### Шаг 2. Проверить лог предыдущих чатов

Открыть файл: `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`
Если найден чат по теме — перейти через `browser_navigate` на URL чата
Если нет — остаться в текущем или новом чате.

### Шаг 3. Выбрать режим (Playwright только)

Сделать `browser_snapshot`, найти кнопки режимов и кликнуть нужную (см. раздел РЕЖИМЫ).

### Шаг 4. Ввести сообщение

**Playwright:**
- `browser_click` на поле ввода
- `browser_type` — напечатать сообщение
- `browser_press_key` → `Enter`

**API:**
- `POST /v1/chat/completions` с нужной моделью и messages

### Шаг 5. Ждать ответа

**Playwright:** Периодически `browser_snapshot`. Пока Stop/thinking — ждать.
**API:** Ответ приходит в JSON. Для stream=false — сразу, для stream=true — читать SSE chunks.

### Шаг 6. Прочитать ответ

**Playwright:** `browser_snapshot` — найти последний блок ассистента.
**API:** Извлечь `choices[0].message.content` из JSON-ответа.

### Шаг 7. Записать лог

Посмотреть текущий URL (Playwright) или использовать metadata ответа (API).
Сохранить запись в `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`.

---

## 🧠 Запоминание успешных действий

**Если действие с элементом сработало — запомнить и больше не пробовать другие варианты для того же элемента.**

Если элемент не найден в snapshot — сделать ещё один snapshot (страница могла измениться), но **не создавать JS-файл**.

---

## 🌐 Навигация

### Провайдер GLM (ZhiPu AI)
| Действие | Как |
|----------|-----|
| Открыть новый чат | `browser_navigate` → `https://chat.z.ai/` |
| Перейти в чат по UUID | `browser_navigate` → `https://chat.z.ai/c/[UUID]` |
| Нажать "New Chat" | `browser_snapshot` найти кнопку "New Chat" → `browser_click` |

### Провайдер Qwen (Alibaba)
| Действие | Как |
|----------|-----|
| Открыть новый чат | `browser_navigate` → `https://chat.qwen.ai/` |
| Перейти в чат по UUID | `browser_navigate` → `https://chat.qwen.ai/c/[UUID]` |
| Нажать "New Chat" | `browser_snapshot` найти кнопку "New Chat" → `browser_click` |

### Провайдер DeepSeek
| Действие | Как |
|----------|-----|
| Открыть новый чат | `browser_navigate` → `https://chat.deepseek.com/` |
| Перейти в чат по URL | `browser_navigate` → `https://chat.deepseek.com/a/chat/s/[UUID]` |
| Нажать "New Chat" | `browser_snapshot` найти кнопку "New Chat" → `browser_click` |

---

## 🎮 Элементы управления — что искать в snapshot

Все элементы ищутся в accessibility tree через `browser_snapshot`.

### Общие элементы (все провайдеры):
**Поле ввода** — textarea или элемент с role=textbox
**Кнопка Send** — button с названием "Send" или иконкой стрелки
**Кнопка Stop** — button "Stop" — видна пока модель генерирует
**New Chat** — button "New Chat" или ссылка на "/"
**Upload файла** — button "Upload" или в меню

### Специфичные для GLM:
**Переключатель модели** — button "GLM-5.1", "GLM-5", "GLM-5-Turbo", "GLM-4.7"
**Agent Mode** — button "Agent" или aria-label "Agent"
**Deep Think** — button "Deep think"
**Меню "+"** — button "More" или "Add"
**Web Search** — в меню "+" пункт "Search" или "联网搜索"
**Индикатор thinking** — элемент с текстом "thinking"
**Кнопки после ответа** — "Copy", "Regenerate"

### Специфичные для Qwen:
**Переключатель модели** — button "Qwen3" или выпадающий список
**Web Search** — toggle button или checkbox
**Индикатор генерации** — анимация или текст "Generating..."
**Кнопки после ответа** — "Copy", "Regenerate", "Thumbs up/down"

### Специфичные для DeepSeek:
**Переключатель модели** — button "DeepThink" или выпадающий список
**Deep Think (R1)** — button "DeepThink" или toggle
**Search** — toggle или checkbox для веб-поиска
**Индикатор генерации** — кнопка Stop или анимация
**Кнопки после ответа** — "Copy", "Regenerate"

---

## ⏳ Ожидание ответа — признаки

### GLM / Qwen / DeepSeek (Playwright)

**Ещё думает (ЖДАТЬ):**
- Кнопка **Stop** видна в snapshot
- Элемент **thinking** / **Generating** виден

**Ответ готов (ЧИТАТЬ):**
- Кнопка **Stop** исчезла
- Появились кнопки **Copy** / **Regenerate**

**Таймаут:** не более 3 минуты. Snapshot каждые 10-15 секунд.

### API-режим

**Нестримящий:** ответ приходит сразу в JSON.
**Стримящий:** читать SSE chunks до `finish_reason: "stop"`.

---

## 🔀 Переключение модели

### Playwright

1. `browser_click` на "New Chat" (смена модели только в новом чате)
2. Дождаться загрузки нового чата
3. Найти кнопку текущей модели → кликнуть → выбрать нужную

**Приоритет GLM:** GLM-5.1 → GLM-5 → GLM-5-Turbo → GLM-4.7
**Приоритет Qwen:** qwen-max-latest → qwen-plus-latest → qwen-turbo-latest
**Приоритет DeepSeek:** deepseek-chat → deepseek-reasoner

### API

Указать нужную модель в `model` поле запроса.

---

## 🤖 Режимы провайдеров

### GLM режимы (Playwright)

| Тип запроса | Режим UI | API-эквивалент |
|-------------|----------|---------------|
| "найди", "актуальная версия", "документация" | Web Search | `model: "glm-5.1-search"` (когда будет в API) |
| "архитектура", "рефакторинг", "паттерн" | Deep Think | `model: "glm-5.1-deepthink"` (когда будет в API) |
| "сгенерируй", "создай код", "implement" | Agent Mode | `model: "glm-5.1-agent"` (когда будет в API) |
| Всё остальное | без режима | `model: "glm-5.1"` |

### Qwen режимы

| Тип запроса | Режим UI | API-эквивалент |
|-------------|----------|---------------|
| "найди", "актуальная информация" | Web Search toggle | `extra_body.enable_search: true` |
| "подумай", "reasoning" | Выбор qwq модели | `model: "qwq-32b"` |
| Код | Выбор coder модели | `model: "qwen2.5-coder-32b-instruct"` |
| Всё остальное | без режима | `model: "qwen-max-latest"` |

### DeepSeek режимы

| Тип запроса | Режим UI | API-эквивалент |
|-------------|----------|---------------|
| "подумай", "reasoning" | DeepThink toggle | `model: "deepseek-reasoner"` |
| Поиск | Search toggle | `model: "deepseek-chat"` + search param |
| Всё остальное | без режима | `model: "deepseek-chat"` |

### Включение режима (Playwright)

1. `browser_snapshot` — найти нужную кнопку
2. Проверить состояние (aria-pressed="true" = уже включена)
3. Если не включена — `browser_click`
4. Пауза (snapshot) — убедиться что включилась

---

## 📎 Файлы

### Отправить файл (Playwright только)

1. `browser_click` на кнопку "More" / "Add" / "+"
2. `browser_snapshot` — найти пункт "Upload"
3. `browser_click` на "Upload"
4. `browser_upload_file` — передать путь к файлу

**GLM нативно:** `.pdf`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.md`, `.py`, `.bmp`, `.gif`, `.mp4`
**Требуют конвертации в `.txt`:** `.java`, `.js`, `.ts`, `.kt`, `.scala`, `.go`, `.rs`, `.cpp`, `.cs`

### Получить файл

`browser_snapshot` → найти "Download" → `browser_click`

---

## 📋 Лог чатов

Лог: `log/YYYY-MM-DD/`
- GLM: `glm-chat-log-YYYY-MM-DD.md`
- Qwen: `qwen-chat-log-YYYY-MM-DD.md`
- DeepSeek: `deepseek-chat-log-YYYY-MM-DD.md`

### Формат записи:
```
| [дата] | [время] | [UUID] | [тема] | [URL] | [провайдер] | [mode: API|PW] | ✅ |
```

### Пример:
```
| 2026-06-12 | 12:04 | 74d5700a | Интеграция webchat2api | https://chat.z.ai/c/74d5700a | GLM | PW | ✅ |
| 2026-06-12 | 12:05 | 9999cf8a | Qwen provider | https://chat.qwen.ai/c/9999cf8a | Qwen | API | ✅ |
```

Перед созданием нового чата — проверить лог на наличие похожей темы.

---

## 📋 Протокол диалога

```
ЭТАП 1: Сбор контекста
  — код, требования, ограничения, существующие решения

ЭТАП 2: Определить режим
  — GLM → Playwright
  — Qwen/DeepSeek → API (с health check), fallback → Playwright

ЭТАП 3: Отправка запроса
  — API: POST /v1/chat/completions → JSON ответ
  — Playwright: ввести текст → Enter → ждать ответ

ЭТАП 4: Анализ ответа
  — если провайдер задал вопрос → ЭТАП 5

ЭТАП 5: Уточнение
  — ответить на вопрос → повторить ЭТАП 3-4

ЭТАП 6: Записать лог
  — UUID, тема, провайдер, режим (API/PW)
```

🚨 Не прерывать пока Stop видна в snapshot (Playwright).
💬 "ГОТОВО" = агент закончил, ждёт ответ.

---

## ❌ Что делать при ошибках

### Fallback-цепочка (критически важно!)

| Ситуация | Действие |
|----------|----------|
| API health check падает | Переключиться на Playwright для этого провайдера |
| API вернул 401/403 | Попробовать refresh → если не помог → Playwright |
| API вернул 429 (rate limit) | Подождать 30 сек → retry → если 3 раза → Playwright |
| API timeout (>30 сек) | Retry 1 раз → если снова → Playwright |
| Playwright: элемент не найден | Ещё один snapshot (страница грузится) |
| Playwright: поле ввода не принимает текст | `browser_click` на него сначала |
| Playwright: браузер закрыт | Перейти на URL провайдера |

### Ошибки по провайдерам:

| Провайдер | Ошибка | Действие |
|-----------|--------|----------|
| GLM | Модель перегружена | Переключиться на GLM-5-Turbo или GLM-4.7 |
| GLM | Не залогинен | Сообщить — нужен ручной вход на chat.z.ai |
| Qwen | Не залогинен | API: refresh token → Playwright fallback |
| Qwen | CSRF ошибка | Переоткрыть страницу, получить новый CSRF |
| DeepSeek | Не залогинен | API: refresh token → Playwright fallback |
| DeepSeek | Rate limit | Подождать, переключить аккаунт в пуле |

⛔ НЕ писать "попробую другой подход" и не создавать JS-файлы.
✅ Сообщить пользователю точно что не получается.

---

## 🏗️ Архитектура (для справки)

```
glm-chat-mcp/
├── SKILL.md                      ← этот файл, инструкции агента
├── src/
│   ├── GLMChatClient.js          ← Singleton клиент (не запускать вручную)
│   ├── GLMChatClient-extended.js ← расширенные возможности (опционально)
│   ├── selectors.js / errors.js / logger.js
│   ├── chat/GLMChatManager.js    ← управление UUID
│   ├── config/browser_selectors.json
│   └── utils/
│       ├── fileManager.js        ← файлы, zero deps
│       ├── glmChatLogger.js      ← лог UUID
│       └── ...
└── log/                          ← UUID логи по датам
```

### webchat2api (отдельный Docker-сервис)

```
webchat2api/                      ← https://github.com/zqbxdev/webchat2api
├── services/providers/
│   ├── base.py                   ← протоколы ChatAdapter, AccountAdapter
│   ├── registry.py               ← MODEL_REGISTRY, normalize_provider()
│   ├── gpt/                      ← GPT/ChatGPT provider (готов)
│   ├── grok/                     ← Grok/xAI provider (готов)
│   ├── gemini/                   ← Gemini provider (готов)
│   ├── glm/                      ← 🆕 GLM provider (TODO: порт ZtoApi)
│   ├── qwen/                     ← 🆕 Qwen provider (TODO: SSE + CSRF)
│   └── deepseek/                 ← 🆕 DeepSeek provider (TODO: копипаст Qwen)
└── api/
    └── ai.py                     ← /v1/chat/completions, /v1/models
```

Зависимости: `playwright` (MCP), webchat2api (Docker, опционально)

---

## 📝 CHANGELOG

### v7.0.0 (current) — Dual-mode Architecture
- ✅ **Dual-mode:** Playwright + API через webchat2api
- ✅ **DeepSeek** провайдер добавлен (триггеры, навигация, режимы)
- ✅ **Mode Router:** GLM → Playwright primary, Qwen/DeepSeek → API primary
- ✅ **Fallback-цепочка:** API → Playwright при ошибках, и наоборот
- ✅ **API-режим:** POST /v1/chat/completions через webchat2api
- ✅ **Маппинг моделей:** Qwen (max/plus/turbo/qwq/coder), DeepSeek (chat/reasoner)
- ✅ **Маппинг режимов:** Web Search, Deep Think, Agent Mode → model-суффиксы + extra_body
- ✅ **Health check:** GET /health перед использованием API
- ✅ Консультация с GLM и Qwen для валидации архитектуры

### v6.0.0
- ✅ Добавлена поддержка второго провайдера Qwen (Alibaba)
- ✅ Новые триггеры: `обсуди с qwen`, `ask qwen`, `qwen`
- ✅ URL Qwen: `https://chat.qwen.ai/` и `https://chat.qwen.ai/c/[UUID]`
- ✅ Раздельная навигация и элементы управления для GLM и Qwen
- ✅ Раздельные логи чатов для каждого провайдера

### v5.2.0
- ✅ Убраны все JS-блоки кода из SKILL.md
- ✅ Инструкции переформатированы как прямые действия через Playwright MCP
- ✅ Добавлено правило запоминания успешных элементов
- ✅ Явный запрет на создание файлов для работы с браузером
