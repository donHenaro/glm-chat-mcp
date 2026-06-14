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
# GLM Chat MCP Skill v15.0 — Network Intelligence + OpenAI Bridge
---

GLM Chat MCP is a browser-automation skill for consulting GLM, Qwen, and DeepSeek chat providers via Playwright. It intercepts SSE responses at the network level (fetch/EventSource hooks), provides a unified provider-adapter API, and exposes an OpenAI-compatible HTTP bridge (`/v1/chat/completions`, `/v1/models`) for programmatic access. Detailed docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/API.md](docs/API.md)

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

## 🔄 Workflow — 7 шагов

1. **Определить провайдера и режим** — Триггер → провайдер. Agent Mode триггеры: `найди`, `проанализируй`, `выполни код`, `исследуй`, `agent`
2. **Проверить лог, найти существующий чат** — `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`
3. **Переключиться на вкладку провайдера** — GLM: `chat.z.ai`, Qwen: `chat.qwen.ai`, DeepSeek: `chat.deepseek.com`
4. **Выбрать режим** — `browser_snapshot` → кнопка режима → `browser_click`
5. **Отправить сообщение** — `browser_click` textarea → `browser_type` → `browser_press_key` Enter
6. **Ожидание ответа** — Фаза 1: spinner/Stop (0-15с). Фаза 2: 2+ SVG-кнопки стабильны 3 сек
7. **Прочитать ответ** — `browser_evaluate(readResponse('glm'))` → `{ done, textLen, text, source, provider }`

---

## 🏗️ Файлы проекта

```
glm-chat-mcp/
├── SKILL.md                 ← инструкции агента (этот файл)
├── _meta.json               ← машиночитаемый конфиг (единый источник версий)
├── scripts/                 ← JS-скрипты для browser_evaluate
│   ├── response.js          ← Response Detection + чтение + healthCheck
│   ├── hooks-auto-init.js   ← Единая точка входа — auto-init hooks + trace + adapters
│   ├── network-hooks.js     ← Network interception — перехват fetch/EventSource, SSE-буфер
│   ├── session-manager.js   ← Session persistence — cookies + localStorage
│   ├── provider-adapter.js  ← Унифицированный API + SSE adapters (GLM/OpenAI/Qwen/DeepSeek + OpenAINormalizer)
│   ├── cdp-intercept.js     ← WebSocket interception
│   ├── ai-extract.js        ← AI-powered extract fallback — 5 стратегий
│   ├── debug-trace.js       ← Debug tracing — логирование + ошибки + таймеры
│   ├── multi-collect.js     ← Сбор ответов multi-provider
│   ├── blob-download.js     ← Blob-перехват (текст + бинарные)
│   └── progress-monitor.js  ← Мониторинг Agent Mode
├── server/                  ← OpenAI-compatible HTTP bridge + CloakBrowser MCP
│   ├── openai-bridge.js     ← Express + Playwright → /v1/chat/completions
│   ├── cloak-browser-mcp.js ← CloakBrowser MCP server (stdio JSON-RPC)
│   ├── test-e2e.js          ← E2E test suite (11 tests)
│   ├── package-cloak.json   ← CloakBrowser dependencies
│   └── README.md            ← Server documentation
├── docs/                    ← Документация
│   ├── ARCHITECTURE.md      ← Архитектура: Network Hooks, Adapters, Bridge, Sessions
│   ├── API.md               ← OpenAI Bridge API reference
│   ├── reference.md         ← Техническая справка API провайдеров
│   ├── history/             ← История разработки
│   └── plans/               ← Планы развития
├── Dockerfile               ← Docker image
├── docker-compose.yml       ← Docker Compose
└── package.json             ← Node.js dependencies
```

---

## 🆕 Порядок инициализации (v14.0+)

При первом обращении к провайдеру в сессии:

1. `browser_evaluate(filename='hooks-auto-init.js')` — **Единая точка входа** — автоматически:
   - Устанавливает network hooks (fetch/EventSource перехват)
   - Инициализирует debug trace
   - Инициализирует адаптеры (если provider-adapter.js SSE classes загружены)
2. `browser_evaluate(filename='provider-adapter.js')` — унифицированный API + SSE адаптеры
3. `browser_evaluate(filename='session-manager.js')` — если нужна session persistence

После инициализации использовать:
- `browser_evaluate('window.__adapter.observe()')` — полная диагностика
- `browser_evaluate('window.__adapter.read()')` — чтение ответа (adapter → network → DOM)
- `browser_evaluate('window.__adapter.healthCheck()')` — проверка всех систем
- `browser_evaluate('window.__session.status()')` — статус авторизации
- `browser_evaluate('window.__netBuffer.stats()')` — статистика перехваченных запросов

---

## 📖 Подробная документация

| Документ | Содержание |
|----------|-----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Network Hooks, Provider Adapters, OpenAI Bridge, Session Mgmt, CDP, CloakBrowser, AI-Extract, Response Detection, Error Recovery |
| [docs/API.md](docs/API.md) | OpenAI Bridge API: endpoints, request/response formats, streaming, function calling, auth, env variables |

---

## ✅ Provider Status

| Provider | Send | Network (SSE) | DOM | Input Type | API Endpoint |
|----------|------|---------------|-----|------------|-------------|
| **GLM** | ✅ | ✅ 18-492 tok | ✅ | textarea | `/api/v2/chat/completions` |
| **Qwen** | ✅ | ✅ 1-30 tok | ✅ | textarea | `/api/v2/chat/completions` |
| **DeepSeek** | ✅ | ⚠️ re-override | ✅ | textarea | `/api/v0/chat/completion` |
| **Kimi** | ✅ | ❌ gRPC | ✅ | contenteditable | gRPC-web |

---

## 📝 Changelog

### v15.1.0 (current) — Multi-Provider Testing: GLM ✅ Qwen ✅ DeepSeek ✅ Kimi ✅

- 🆕 Kimi adapter: contenteditable input, gRPC (DOM-only), `.chat-input-editor`
- 🆕 Contenteditable support in `humanInput()`: `execCommand('insertText')` for React/Vue
- 🆕 Real API patterns from testing: GLM=`/api/v2/chat/completions`, Qwen=same, DeepSeek=`/api/v0/chat/completion`, Kimi=gRPC
- 🆕 All 4 providers tested: short answer + long answer, send/read cycles
- 🆕 `docs/plans/provider-testing-results.md` — full test results
- ⚠️ Kimi: network hooks don't work (gRPC), DOM fallback only
- ⚠️ DeepSeek: SPA caches fetch, needs re-override after page load
- ⚠️ Qwen/GLM: navigation destroys scripts, needs `addInitScript` for production

### v15.0.0 — P3 Complete: E2E + Function Calling + Token Accuracy

- 🆕 E2E test suite: 11/11 tests pass (`server/test-e2e.js`)
- 🆕 Real chat completion via CDP: prompt→GLM→response in OpenAI format
- 🆕 Function Calling эмуляция: tools → system prompt injection → parse tool_calls from response
- 🆕 `stream_options: {include_usage: true}` → usage in final `[DONE]` chunk
- 🆕 Token estimation: char→token heuristic (4 chars ≈ 1 token EN, 1.5 chars ≈ 1 token CJK)
- 🆕 `parseToolCalls()`: extracts `<tool_call>` JSON blocks from model response

### v14.4.0 — P3.1 Production Hardening

- 🆕 API Authentication: Bearer token + query key (env API_KEYS)
- 🆕 Rate Limiting: per-key, X-RateLimit-* headers, 429 errors
- 🆕 Response Cache: in-memory, TTL 5 min, hash-based, eviction
- 🆕 Auto-Retry & Fallback: GLM↔DeepSeek cross-provider retry
- Env config: API_KEYS, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX, CACHE, CACHE_TTL

*See `docs/history` in the git repo for older entries (v14.3.0 and below).*
