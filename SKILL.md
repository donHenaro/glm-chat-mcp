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
# GLM Chat MCP Skill v8.0 — Direct API + Playwright Fallback
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

### Стратегия A: SSE-перехват (рекомендуемая для GLM и DeepSeek)

GLM использует **SHA-256 X-Signature**, а DeepSeek — **Proof-of-Work challenge**.
Подделать оба механизма сложно. Вместо этого агент **отправляет через UI** (textarea + Enter),
но **перехватывает SSE-ответ** через patched fetch.

**Шаг 1:** Установить перехватчик SSE (один раз при старте сессии):
```javascript
// browser_evaluate на вкладке GLM
window.__sseChunks = [];
const origFetch = window.fetch;
window.fetch = async function(...args) {
  const [url, opts] = args;
  const response = await origFetch.apply(this, args);
  if (typeof url === 'string' && url.includes('chat/completions')) {
    const origBody = response.body;
    if (origBody) {
      const reader = origBody.getReader();
      const decoder = new TextDecoder();
      const stream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { controller.close(); break; }
            const chunk = decoder.decode(value, { stream: true });
            window.__sseChunks.push(chunk);
            controller.enqueue(value);
          }
        }
      });
      return new Response(stream, {
        status: response.status, headers: response.headers
      });
    }
  }
  return response;
};
```

**Шаг 2:** Очистить буфер и отправить через UI:
```javascript
window.__sseChunks = [];
// Затем: textarea.fill(prompt) + textarea.press('Enter') через Playwright
```

**Шаг 3:** Прочитать SSE-ответ:
```javascript
// browser_evaluate — дождаться нужного количества chunks
const chunks = window.__sseChunks || [];
// GLM SSE формат (НЕ OpenAI!):
// data: {"type":"chat:completion","data":{"phase":"other","usage":{...}}}
// data: {"type":"chat:completion","data":{"delta_content":"Ответ","phase":"answer"}}
// data: {"type":"chat:completion","data":{"phase":"done","done":true}}
```

**Парсинг GLM SSE:**
```javascript
const chunks = window.__sseChunks || [];
const fullText = chunks
  .flatMap(c => c.split('\n'))
  .filter(line => line.startsWith('data: '))
  .map(line => { try { return JSON.parse(line.slice(6)); } catch { return null; } })
  .filter(d => d?.type === 'chat:completion' && d?.data?.delta_content)
  .map(d => d.data.delta_content)
  .join('');
const isDone = chunks.some(c => c.includes('"phase":"done"'));
return { fullText, isDone };
```

### Стратегия B: Прямой API-запрос (для Qwen)

Qwen **не использует signature или PoW** — можно делать прямые fetch-запросы.

---

### GLM API — техническая справка

**Реальный endpoint:** `POST /api/v2/chat/completions?<fingerprint>`
- Query: timestamp, requestId, user_id, version=0.0.1, platform=web, token=<JWT>, user_agent, language, timezone, screen_*, viewport_*, signature_timestamp
- Headers: `Authorization: Bearer <JWT>`, `X-FE-Version: prod-fe-1.1.52`, `X-Signature: <SHA-256>`, `X-Region: overseas`
- Body: `{stream:true, model:"GLM-5.1", messages:[...], signature_prompt:<prompt>, features:{...}}`
- **X-Signature** — SHA-256 хеш, вычисляемый встроенной sha.js библиотекой из минифицированного бандла
- ⚠️ **НЕ пытаться подделать подпись** — используй Стратегию A (SSE-перехват)

**GLM SSE формат (собственный, НЕ OpenAI):**
```
data: {"type":"chat:completion","data":{"phase":"other","usage":{...}}}
data: {"type":"chat:completion","data":{"delta_content":"Текст","phase":"answer"}}
data: {"type":"chat:completion","data":{"phase":"done","done":true,"metadata":{...}}}
```

**Режимы через features:**
| Режим | Параметр в features |
|-------|---------------------|
| Обычный | `web_search:false, auto_web_search:false` |
| Deep Think | `enable_thinking:true` + `reasoning_effort:"high"/"max"` |
| Web Search | `web_search:true` или `auto_web_search:true` |
| Agent Mode | `flags:["general_agent"]` + `reasoning_effort:"max"` |

---

### Qwen API (Alibaba) — прямой запрос

**Двухэтапный процесс:**

**Шаг 1:** Создать чат
```
POST https://chat.qwen.ai/api/v2/chats/new
Authorization: Bearer <JWT>
Body: {"title":"New Chat","models":["qwen-max-latest"],"chat_mode":"local","chat_type":"t2i","timestamp":<ms>}
Response: {"data":{"id":"chat-uuid"}}
```

**Шаг 2:** Chat completion
```
POST https://chat.qwen.ai/api/v2/chat/completions?chat_id=<chat_uuid>
Authorization: Bearer <JWT>
Headers: source:web, Version:0.1.13, bx-v:2.5.31, Origin:https://chat.qwen.ai
Body: {"model":"qwen-max-latest","messages":[...],"stream":true,"chat_id":"<uuid>","web_search":false,"thinking":false}
```

**Режимы:**
| Режим | Параметр |
|-------|----------|
| Обычный | `web_search:false, thinking:false` |
| Web Search | `web_search:true` |
| Reasoning | `thinking:true` + model `qwq-32b` |

---

### DeepSeek API — техническая справка

**Реальный endpoint:** `POST /api/v0/chat/completion`
**⚠️ Proof-of-Work!** Перед каждым запросом:
1. `POST /api/v0/chat/create_pow_challenge` — получить challenge
2. Решить PoW (SHA-256 hashcash) в браузере
3. `POST /api/v0/chat/completion` — с решённым PoW в заголовке

**Auth:** `Bearer <userToken>` (из localStorage.userToken.value)

⚠️ **НЕ пытаться подделать PoW** — используй Стратегию A (SSE-перехват)

**SSE формат:** OpenAI-совместимый:
```
data: {"choices":[{"delta":{"content":"Текст"}}]}
data: {"choices":[{"delta":{"reasoning_content":"Думаем..."}}]}  ← R1
data: [DONE]
```

**Режимы:**
| Режим | Параметр |
|-------|----------|
| Обычный | `model:"deepseek-chat"` |
| Deep Think (R1) | `model:"deepseek-reasoner"` → `reasoning_content` в delta |

⚠️ **КРИТИЧЕСКОЕ:** `reasoning_content` **обязателен** (даже пустой) в messages ассистента при tool_calls — иначе HTTP 400!

---

### Qwen API (Alibaba)

**⚠️ Двухэтапный процесс!**

**Шаг 1:** Создать чат
```
POST https://chat.qwen.ai/api/v2/chats/new
Authorization: Bearer <JWT>
Body: {"title": "New Chat", "models": ["qwen-max-latest"], "chat_mode": "local", "chat_type": "t2i", "timestamp": <ms>}
Response: {"data": {"id": "chat-uuid-xxxxx"}}
```

**Шаг 2:** Chat completion
```
POST https://chat.qwen.ai/api/v2/chat/completions?chat_id=<chat_uuid>
Authorization: Bearer <JWT>
Headers: source: web, Version: 0.1.13, bx-v: 2.5.31, Origin: https://chat.qwen.ai
Body: {"model": "qwen-max-latest", "messages": [...], "stream": true, "chat_id": "<chat_uuid>", "web_search": false, "thinking": false}
```

**Режимы:**
| Режим | Параметр |
|-------|----------|
| Обычный | `"web_search": false, "thinking": false` |
| Web Search | `"web_search": true` |
| Reasoning (qwq) | `"thinking": true` + model `"qwq-32b"` |

---

### DeepSeek API

**Endpoint:** `POST https://chat.deepseek.com/api/v0/chat/completions`

**Обязательные заголовки:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Payload:**
```json
{
  "model": "deepseek-chat",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

**Режимы:**
| Режим | Параметр |
|-------|----------|
| Обычный | `"model": "deepseek-chat"` |
| Deep Think (R1) | `"model": "deepseek-reasoner"` → `reasoning_content` в delta |

---

## 🔄 Workflow — Пошаговые действия

### Шаг 0. Определить провайдера

| Триггер | Провайдер |
|---------|-----------|
| `glm`, `zai` | GLM |
| `qwen` | Qwen |
| `deepseek` | DeepSeek |
| Не указан | GLM |

### Шаг 1. GLM — SSE-перехват (Стратегия A)

1. Проверить есть ли SSE-перехватчик (`window.__sseChunks`)
2. Если нет — установить (один раз при старте сессии, см. «Стратегия A»)
3. Очистить буфер: `window.__sseChunks = []`
4. Отправить сообщение через UI: `textarea.fill(prompt)` → `Enter`
5. Ждать ответ: polling `window.__sseChunks` каждые 3-5 сек, пока не появится `phase:"done"`
6. Парсить SSE chunks → извлечь `delta_content` → вернуть текст

### Шаг 2. Qwen — Прямой API (Стратегия B)

1. Извлечь токены из localStorage/cookies (см. секцию «Получение токенов»)
2. Отправить fetch-запрос: сначала `chats/new`, потом `completions`
3. Прочитать SSE stream или JSON ответ

### Шаг 3. DeepSeek — SSE-перехват (Стратегия A)

1. Переключиться на вкладку DeepSeek
2. Установить SSE-перехватчик (аналогично GLM)
3. Очистить буфер, отправить через UI, прочитать SSE

### Шаг 4. Fallback на Playwright (если SSE/API не сработали)

| Причина fallback | Действие |
|-------------------|----------|
| SSE-перехват не работает | Обновить страницу, переустановить перехватчик |
| API вернул 401/403 | Обновить токены (refresh), повторить; если не помогло — Playwright |
| API timeout (>30с) | Retry 1 раз, затем Playwright |
| API 429 (rate limit) | Подождать 30с, retry; при повторе — Playwright |
| Ошибка парсинга ответа | Playwright snapshot как запасной вариант |

### Шаг 4. Playwright-режим (только fallback)

1. `browser_snapshot` — проверить состояние страницы
2. Перейти на нужный URL если не там
3. Ввести сообщение в поле ввода → Enter
4. Ждать ответа (snapshot polling: Stop → Copy/Regenerate)
5. Прочитать ответ из accessibility tree

### Шаг 5. Обработать ответ

**SSE-перехват (GLM):** Парсить `delta_content` из chunks
**API (Qwen/DeepSeek):** Извлечь `choices[0].message.content` или `reasoning_content`
**Playwright:** Найти последнее сообщение ассистента в snapshot

### Шаг 5. Записать лог

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

| Режим | API-параметр | Playwright UI |
|-------|-------------|---------------|
| Обычный | по умолчанию | без режима |
| Deep Think | `"thinking": {"type": "enabled"}` | кнопка "Deep think" |
| Agent Mode | `"tools": [...], "tool_choice": "auto"` | кнопка "Agent" |
| Web Search | `"tools": [{"function": {"name": "web_search"}}]` | меню "+" → "Search" |

### Qwen режимы

| Режим | API-параметр | Playwright UI |
|-------|-------------|---------------|
| Обычный | `"web_search": false` | без режима |
| Web Search | `"web_search": true` | toggle Web Search |
| Reasoning | `"thinking": true`, model `qwq-32b` | выбор модели qwq |

### DeepSeek режимы

| Режим | API-параметр | Playwright UI |
|-------|-------------|---------------|
| Обычный | `"model": "deepseek-chat"` | без режима |
| Deep Think | `"model": "deepseek-reasoner"` | toggle DeepThink |

### Автоматический выбор режима

| Тип запроса | Режим |
|-------------|-------|
| "найди", "актуальная версия", "документация" | Web Search |
| "архитектура", "рефакторинг", "паттерн" | Deep Think |
| "сгенерируй", "создай код", "implement" | Agent Mode (GLM) / без режима |
| "подумай", "reasoning" | Deep Think / Reasoner |
| Всё остальное | без режима |

---

## 📎 Файлы (Playwright только)

1. `browser_click` на "More" / "Add" / "+"
2. `browser_snapshot` → найти "Upload"
3. `browser_click` на "Upload"
4. `browser_upload_file` — передать путь к файлу

**GLM нативно:** `.pdf`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`, `.md`, `.py`, `.bmp`, `.gif`, `.mp4`
**Конвертировать в `.txt`:** `.java`, `.js`, `.ts`, `.kt`, `.scala`, `.go`, `.rs`, `.cpp`, `.cs`

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
ЭТАП 2: Определить режим (API-first)
ЭТАП 3: Извлечь токены из браузера
ЭТАП 4: API-запрос через browser_evaluate → fetch()
         ↓ при ошибке
         Playwright fallback (Шаг 3)
ЭТАП 5: Анализ ответа
ЭТАП 6: Записать лог
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

## 🏗️ Архитектура (для справки)

```
glm-chat-mcp/                     ← https://github.com/donHenaro/glm-chat-mcp
├── SKILL.md                      ← этот файл, инструкции агента v8.0
├── src/                          ← legacy (не запускать вручную)
├── webchat2api-providers/        ← провайдеры для webchat2api (референс)
│   ├── glm/models.py, accounts.py, chat.py
│   ├── qwen/models.py, accounts.py, chat.py
│   ├── deepseek/models.py, accounts.py, chat.py
│   └── patches/                  ← патчи для base.py, registry.py
└── log/                          ← логи чатов
```

### Репозиторий: https://github.com/donHenaro/glm-chat-mcp.git

---

## 📝 CHANGELOG

### v8.0.0 (current) — Direct API + Playwright Fallback
- 🔥 **API-first:** прямые HTTP-запросы к backend API провайдеров через `fetch()`
- 🔥 **Токены из сессии:** извлечение JWT/cookies из текущего браузера
- ✅ **GLM API:** `internal-api.z.ai/v1/chat/completions`, Bearer Z.ai + X-Token JWT
- ✅ **GLM режимы:** thinking: {type: enabled/disabled}, tools: [web_search]
- ✅ **Qwen API:** двухэтапный — /api/v2/chats/new → /api/v2/chat/completions
- ✅ **Qwen режимы:** web_search: true/false, thinking: true/false
- ✅ **DeepSeek API:** /api/v0/chat/completions, model: deepseek-reasoner
- ✅ **Fallback:** API → Playwright при ошибках/timeout
- ✅ Консультации: GLM×3, Qwen×2, DeepSeek×1

### v7.0.0
- Dual-mode архитектура с webchat2api proxy
- DeepSeek провайдер

### v6.0.0
- Qwen провайдер
