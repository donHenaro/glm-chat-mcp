# Декомпозиция openai-bridge.js — Task Execution Plan

## Your Mission

Разобрать монолит `server/openai-bridge.js` (961 строк) на модульную архитектуру.
Часть модулей уже вынесена (browser.js, session.js, cache.js, helpers.js, streaming.js, metrics.js, rate-limit.js, state.js), но **оригинальный файл не обновлён** — весь код всё ещё в монолите с дублированием.

**Цель:** openai-bridge.js → slim `app.js` (entry) + `routes/` (endpoints) + существующие `services/` + `utils/`.

**Plan File:** `.tasks/decompose-bridge/PLAN.md`
**Tasks Directory:** `.tasks/decompose-bridge/`

---

## Execution Steps

### 1. Read This Plan
Review this file for the next incomplete task, key decisions, and information from previous agents.

### 2. Understand Your Task
Read your task file: `.tasks/decompose-bridge/task-XX-[name].md`
- **Goal** — What you are trying to achieve
- **Key Points** — Important considerations
- **Done When** — Objective acceptance criteria

### 3. Execute the Task
- Make necessary code changes
- Ensure code compiles without errors (`node -c server/app.js`)
- Verify all Done When criteria are met

### 4. Update This Plan
- Mark the task as completed in `## Task Plan`
- Add a 1-2 sentence outcome summary in `## Shared Context`
- Document only critical decisions that affect future tasks

### 5. Await Approval (MANDATORY)
Wait for user confirmation before proceeding to the next task.

### 6. Review Task List (MANDATORY)
Analyze remaining tasks based on what you learned:
- Did you encounter unexpected complexity?
- Should any tasks be split, merged, removed, or reordered?
- Are there missing tasks?

### 7. Present Review Findings (MANDATORY)
Always present your findings — even if no changes are needed — and await user approval before proceeding.

### 8. Update Task Files (if approved)
- Modify/create task files as needed
- Update `## Task Plan` in PLAN.md accordingly

---

## Task Plan

- [ ] `task-01-create-routes-chat.md`: Вынести POST /v1/chat/completions в routes/chat.js
- [ ] `task-02-create-routes-admin.md`: Вынести GET /v1/models, /v1/status, /v1/sessions, /metrics в routes/admin.js
- [ ] `task-03-create-app-entry.md`: Создать server/app.js — slim entry point с middleware
- [ ] `task-04-complete-streaming-service.md`: Перенести streaming/response polling логику в services/streaming.js
- [ ] `task-05-update-docker-entrypoint.md`: Обновить docker-entrypoint.sh на новый entry point
- [ ] `task-06-delete-monolith.md`: Удалить openai-bridge.js (после верификации)
- [ ] `task-07-e2e-tests.md`: Запустить test-e2e.js и убедиться что все 11 тестов проходят

---

## Shared Context

### Overview
Декомпозиция Express-сервера (961 строк) на модульную архитектуру. Сервер транслирует OpenAI-совместимые HTTP-запросы через Playwright → браузер → AI-провайдер (GLM, DeepSeek, Qwen, Kimi).

### Existing Modules (already created, NOT in use yet)
| Файл | Строки | Роль |
|------|--------|------|
| `server/state.js` | 12 | Shared mutable state: browser, contexts, sessions, responseCache |
| `server/services/cache.js` | 44 | cacheHash, cacheGet, cacheSet (djb2 hash, TTL, LRU eviction) |
| `server/services/session.js` | 137 | Session CRUD, expiry, auto-reuse, page history extraction |
| `server/services/helpers.js` | 82 | estimateTokens, buildToolPrompt, parseToolCalls |
| `server/services/streaming.js` | 101 | NETWORK_HOOKS_SCRIPT, injectHooks, flushBuffer, sendPrompt |
| `server/services/browser.js` | 143 | discoverCDP, ensureBrowser, getOrCreateContext, shutdown |
| `server/utils/metrics.js` | 76 | Prometheus metrics object + formatPrometheus() |
| `server/utils/rate-limit.js` | 33 | createRateLimiter middleware |

### openai-bridge.js Line Map (961 lines — монолит)
```
1-37      Header comment (JSDoc)
39-54     CloakBrowser / Playwright chromium import
56-77     Configuration: PORT, HEADLESS, PROVIDERS, DEFAULT_MODEL, TIMEOUT_MS, CDP_DEFAULT_PORT, SESSION_TTL_MS
79-82     State: browser, contexts, sessions (duplicates state.js)
84-109    Cache: CACHE_ENABLED, CACHE_TTL_MS, cacheHash, cacheGet, cacheSet (duplicates cache.js)
111-113   Express app + json parser
115-135   API Authentication middleware
137-157   Rate Limiting middleware (duplicates rate-limit.js)
159-193   discoverCDP() (duplicates browser.js)
195-210   createSessionId(), cleanExpiredSessions() (duplicates session.js)
212-224   GET /v1/models
226-538   POST /v1/chat/completions — MAIN ENDPOINT
540-628   getOrCreateContext() (duplicates browser.js)
630-634   SIGINT graceful shutdown
636-726   metrics object + GET /metrics
728-739   GET /v1/status
741-754   GET /v1/sessions
756-830   GET /v1/sessions/:id/history
832-838   app.listen()
```

### POST /v1/chat/completions (lines 226-538) — разбор
```
226-228   Destructure request body
230-233   Validate messages
235-238   Validate model / look up PROVIDERS
240-242   Check x-session-id header
244       cleanExpiredSessions()
246-251   Extract last user message
253-285   Auto-reuse + URL routing (uses session.js functions)
287-318   Function calling emulation: tools → prompt injection
320-324   Logging + metrics tracking
326-337   Cache check (non-streaming)
339-344   getOrCreateContext(provider)
346-361   Page selection / session reuse
363-375   Navigate to provider URL
377-459   Inject network hooks (duplicates streaming.js)
461-463   Flush buffer + track message
465-490   Send prompt via textarea (duplicates streaming.js)
492-495   Generate chatId, startTime
497-506   estimateTokens() helper (duplicates helpers.js)
508-513   Prompt tokens estimation
515       stream_options.include_usage check
517-538   SSE streaming loop (polling network buffer)
          → включает parseToolCalls для stream
          → финальный chunk + usage chunk
```

### Non-streaming response (внутри POST, lines ~540-630 в оригинале, сейчас в той же функции)
- Polling loop для ответа
- DOM fallback для Kimi/DeepSeek
- parseToolCalls() для function calling
- Build response JSON
- cacheSet() + session tracking

### Error handling + retry (lines ~632-660)
- Catch block
- Auto-retry with fallback provider
- 500 error response

### Test-e2e.js (146 строк, 11 тестов)
```
GET  /v1/models              → 200, data.length >= 6
GET  /v1/status              → 200, status === 'running'
GET  /metrics                → 200, body includes 'glm_chat_requests_total'
POST /v1/chat/completions {} → 400 (no messages)
POST /v1/chat/completions    → 400 (unknown model)
GET  /v1/status              → models includes 'glm-5.1'
POST /v1/chat/completions    → tools accepted (not 400)
POST /v1/chat/completions    → stream_options accepted (not 400)
GET  /v1/sessions            → 200, sessions array
GET  /v1/models              → 200 (no auth required)
POST /v1/chat/completions    → 200 (real CDP chat)
```

### docker-entrypoint.sh (35 строк)
- Запускает Xvfb для headless браузера
- Опционально VNC
- `exec "$@"` — передаёт командную строку
- package.json start script: `node server/openai-bridge.js`

### Target Architecture
```
server/
├── app.js                    # Entry point: Express app, middleware, listen
├── routes/
│   ├── chat.js               # POST /v1/chat/completions
│   └── admin.js              # GET /v1/models, /v1/status, /v1/sessions, /v1/sessions/:id/history, /metrics
├── services/
│   ├── browser.js            # ✓ exists
│   ├── cache.js              # ✓ exists
│   ├── helpers.js            # ✓ exists
│   ├── session.js            # ✓ exists
│   └── streaming.js          # ✓ exists (needs completion)
├── utils/
│   ├── metrics.js            # ✓ exists
│   └── rate-limit.js         # ✓ exists
├── state.js                  # ✓ exists
└── test-e2e.js               # 11 tests, needs no changes
```

### Module Dependencies
```
app.js
 ├── express
 ├── state.js
 ├── routes/chat.js
 ├── routes/admin.js
 ├── utils/rate-limit.js
 └── utils/metrics.js

routes/chat.js
 ├── services/browser.js
 ├── services/cache.js
 ├── services/session.js
 ├── services/helpers.js
 ├── services/streaming.js
 ├── utils/metrics.js
 └── state.js

routes/admin.js
 ├── services/session.js
 ├── utils/metrics.js
 └── state.js

services/browser.js → state.js
services/session.js → state.js
services/streaming.js → services/helpers.js, state.js
services/cache.js → (no deps)
services/helpers.js → (no deps)
utils/metrics.js → state.js
utils/rate-limit.js → (no deps)
```

### Caveats & Problems
- **streaming.js** не содержит streaming/response polling логику — только injectHooks, flushBuffer, sendPrompt. Основная логика SSE polling (lines 517-538 и non-streaming polling) всё ещё в монолите и должна быть вынесена.
- **Configuration** (PROVIDERS, PORT, TIMEOUT_MS) сейчас в монолите — нужно определить где хранить. Вариант: вынести в `server/config.js` или оставить в app.js.
- **Error handling + auto-retry** (fallback providers) — сейчас в catch блоке POST endpoint. Нужно определить как маршрутизировать.
- **Function calling emulation** — логика injection tools в prompt и parseToolCalls из response распределена между helpers.js и монолитом. helpers.js уже имеет buildToolPrompt и parseToolCalls.
- **session.messages tracking** — монолит добавляет messages в session.messages. session.js не имеет pushMessage() — может потребоваться дополнение.
