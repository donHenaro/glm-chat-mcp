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
# GLM Chat MCP Skill v9.0 — SSE-intercept + Multiturn + Agent Mode
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

### Стратегия A: SSE-перехват (GLM) + DOM-чтение (DeepSeek)

**GLM:** Использует SHA-256 X-Signature → SSE-перехват (отправка через UI, чтение через patched fetch)
**DeepSeek:** Использует Proof-of-Work challenge → DOM-чтение (отправка через UI, чтение innerText из #root)

Оба провайдера требуют отправку через UI (textarea + Enter), но чтение ответа
можно ускорить: GLM — через SSE chunks, DeepSeek — через DOM innerText.

**Шаг 1:** Установить перехватчик SSE (один раз при старте сессии):
```javascript
// browser_evaluate на вкладке GLM
// Проверка — установлен ли уже
if (!window.__sseInterceptorInstalled) {
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
  window.__sseInterceptorInstalled = true;
}
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

### Стратегия B: Прямой API-запрос (НЕ рекомендуется)

Qwen использует **message tree** (parentId/childrenIds/fid) вместо простого массива messages —
прямой API сложен в реализации. Рекомендуется SSE-перехват (Стратегия A).

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

### Qwen API (Alibaba) — через SSE-перехват (рекомендуемая)

⚠️ Прямой API Qwen **сложнее чем казалось** — messages требуют дерево (parentId/childrenIds/fid),
а не простой массив. Рекомендуется SSE-перехват как для GLM.

**Реальный формат перехваченного запроса:**
```
POST /api/v2/chat/completions?chat_id=<uuid>
Headers: Authorization: Bearer <JWT>, Version: 0.2.64, source: web, X-Accel-Buffering: no
Body: {
  "stream": true,
  "version": "2.1",
  "incremental_output": true,
  "chat_id": "<uuid>",
  "chat_mode": "normal",
  "model": "qwen3.7-plus",
  "messages": [{
    "fid": "<uuid>", "parentId": "<uuid>", "childrenIds": ["<uuid>"],
    "role": "user", "content": "...", "user_action": "chat",
    "files": [], "timestamp": <unix>, "models": ["qwen3.7-plus"],
    "chat_type": "t2t",
    "feature_config": {
      "thinking_enabled": true, "thinking_mode": "Auto",
      "thinking_format": "summary", "auto_search": true
    }
  }]
}
```

**Шаг 1 (для прямого API):** `POST /api/v2/chats/new` с `models:["qwen3.7-plus"], chat_mode:"normal", chat_type:"t2t"`
**Шаг 2:** `POST /api/v2/chat/completions?chat_id=<id>` с message tree

**Режимы через feature_config:**
| Режим | Параметр |
|-------|----------|
| Обычный | `thinking_enabled:false, auto_search:false` |
| Web Search | `auto_search:true` |
| Deep Think | `thinking_enabled:true, thinking_mode:"Deep"` |

**Реальные модели Qwen:** `qwen3.7-plus`, `qwen3.7-max`, `qwen3.7-turbo`, `qwq-32b`

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

### Шаг 2. Qwen — SSE-перехват (Стратегия A)

1. Переключиться на вкладку Qwen
2. Установить SSE-перехватчик (аналогично GLM)
3. Очистить буфер, отправить через UI, прочитать SSE
4. Парсинг Qwen SSE — формат отличается от GLM, нужен анализ

### Шаг 3. DeepSeek — DOM-чтение (Стратегия A-variant)

1. Переключиться на вкладку DeepSeek
2. Отправить сообщение через UI: textarea.fill(prompt) → Enter
3. Ждать ответ: polling DOM каждые 3-5 сек
4. Читать ответ: `document.querySelector('#root').innerText` — найти текст после вопроса
5. Признак завершения: текст перестал меняться (2 polling-цикла подряд одинаковая длина)

### Шаг 4. Fallback на Playwright (если SSE/DOM не сработали)

| Причина fallback | Действие |
|-------------------|----------|
| SSE-перехват не работает | Обновить страницу, переустановить перехватчик |
| API вернул 401/403 | Обновить токены, retry; если не помогло — Playwright |
| API timeout (>30с) | Retry 1 раз, затем Playwright |
| API 429 (rate limit) | Подождать 30с, retry; при повторе — Playwright |
| Ошибка парсинга ответа | Playwright snapshot как запасной вариант |

### Шаг 5. Playwright-режим (только fallback)

1. `browser_snapshot` — проверить состояние страницы
2. Перейти на нужный URL если не там
3. Ввести сообщение в поле ввода → Enter
4. Ждать ответа (snapshot polling: Stop → Copy/Regenerate)
5. Прочитать ответ из accessibility tree

### Шаг 6. Обработать ответ

**SSE-перехват (GLM/Qwen):** Парсить `delta_content` / `choices[].delta.content` из chunks
**DOM-чтение (DeepSeek):** Извлечь текст ответа из `#root.innerText`
**Playwright:** Найти последнее сообщение ассистента в snapshot

### Шаг 7. Записать лог

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

GLM Agent Mode (`flags:["general_agent"]`) даёт доступ к встроенным инструментам:

| Инструмент | Описание | Когда использовать |
|------------|----------|-------------------|
| **web_search** | Поиск в интернете | "найди", "актуальная информация", "документация" |
| **code_execution** | Выполнение Python кода | "вычисли", "протестируй", "запусти код" |
| **file_operations** | Чтение/создание файлов | "создай файл", "прочитай файл" |
| **mcp_servers** | Внешние MCP-серверы | Расширенная интеграция |

### Активация Agent Mode:
- **UI:** Нажать кнопку "Agent" в GLM чате
- **SSE-перехват:** features автоматически включат `flags:["general_agent"]`

### Преимущества Agent Mode для консультаций:
- GLM может **исследовать документацию** через web_search
- GLM может **выполнять код** для валидации решений
- GLM может **создавать файлы** прямо в чате

⚠️ Agent Mode расходует больше токенов и медленнее обычного режима.
Использовать только когда нужны инструменты, а не для простых вопросов.

---

## 🔧 SSE-перехватчик — сохранение при навигации

При переходе на новую страницу fetch-патч теряется. Решение:

**Перед каждым использованием проверять наличие патча:**
```javascript
// Проверка — установлен ли перехватчик
if (!window.__sseInterceptorInstalled) {
  // Установить заново (см. секцию «Стратегия A»)
  window.__sseInterceptorInstalled = true;
}
```

✅ Агент должен проверять `window.__sseInterceptorInstalled` перед каждым запросом.
Если `undefined` — переустановить патч.

---

## 🏗️ Архитектура проекта

```
glm-chat-mcp/                     ← https://github.com/donHenaro/glm-chat-mcp
├── SKILL.md                      ← инструкции агента v9.0
└── log/                          ← логи чатов
```

### Репозиторий: https://github.com/donHenaro/glm-chat-mcp.git

---

## 📝 CHANGELOG

### v9.0.0 (current) — SSE-intercept + Multiturn + Agent Mode
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
- GLM SSE-intercept, Qwen двухэтапный API, DeepSeek DOM-read

### v7.0.0
- Dual-mode архитектура с webchat2api proxy, DeepSeek провайдер

### v6.0.0
- Qwen провайдер
