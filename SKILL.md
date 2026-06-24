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
| **GLM** | `zai`, `спроси glm`, `ask glm`, `реализуй`, `создай`, `агент`, `исследуй`, `agent` |
| **Qwen** | `qwen`, `спроси qwen`, `ask qwen`, `обсуди с qwen` |
| **DeepSeek** | `deepseek`, `спроси deepseek`, `ask deepseek` |
| **Kimi** | `kimi`, `спроси kimi`, `ask kimi` |
| **Все** | `спроси всех`, `обсуди со всеми`, `мнение экспертов`, `консенсус`, `все провайдеры` |

### Режимные триггеры (после активации провайдера)

| Режим | Триггеры | Провайдер |
|-------|----------|-----------|
| **DeepThink** | `подумай глубоко`, `deep think`, `глубокое мышление` | GLM, Qwen, DeepSeek |
| **Agent Mode** | `agent mode`, `агент режим`, `выполни` | GLM, Kimi |
| **Web Search** | `поиск в интернете`, `web search`, `найди в сети` | GLM, DeepSeek, Qwen, Kimi(Claw) |
| **Deep Research** | `глубокое исследование`, `deep research`, `исследуй тему` | Kimi |
| **Agent Swarm** | `agent swarm`, `рой агентов`, `мультиагент` | Kimi |
| **Slides/PPT** | `создай презентацию`, `make slides`, `ppt` | Kimi, GLM(AI PPT) |
| **Websites** | `создай сайт`, `make website`, `html` | Kimi |
| **Docs** | `анализ документа`, `проанализируй файл`, `docs` | Kimi |
| **Sheets** | `создай таблицу`, `make spreadsheet`, `csv` | Kimi |
| **Kimi Code** | `kimi code`, `код агент`, `code cli` | Kimi (отдельная страница kimi.com/code, модель K2.7 Code) |
| **/deep-research** | `/deep-research`, `слеш исследование` | Kimi (slash-команда, 10+ итераций) |
| **/docx** | `/docx`, `создай docx`, `word документ` | Kimi (slash → генерация .docx) |
| **/pdf** | `/pdf`, `создай pdf` | Kimi (slash → генерация PDF) |
| **/xlsx** | `/xlsx`, `создай xlsx`, `excel таблица` | Kimi (slash → генерация .xlsx) |

⛔ Не закрывать браузер после консультации
✅ Браузер уже открыт — сначала проверить состояние
📁 JS-скрипты в `scripts/` — загружать через `read_file` → `browser_evaluate`

---

## 🔄 Workflow — 8 шагов

1. **Определить провайдера и режим** — Триггер → провайдер. Agent Mode триггеры: `найди`, `проанализируй`, `выполни код`, `исследуй`, `agent`
2. **Проверить лог, найти существующий чат** — `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md`
3. **Переключиться на вкладку провайдера** — GLM: `chat.z.ai`, Qwen: `chat.qwen.ai`, DeepSeek: `chat.deepseek.com`, Kimi: `kimi.com`
4. **Выбрать режим** — `browser_evaluate('window.__modeSwitch.switch("deepThink")')` или `browser_evaluate(filename='mode-switcher.js')` → `window.__modeSwitch.switch("agentSwarm")`
5. **Загрузить файл (если нужно)** — `page.$('input[type="file"]').setInputFiles(path)` (GLM/Qwen/DeepSeek)
6. **Отправить сообщение** — `browser_evaluate('window.__adapter.send(\"text\")')` — устанавливает текст сразу в DOM (не использовать `browser_type` — он отправляет построчно при Enter)
7. **Ожидание ответа** — Фаза 1: spinner/Stop (0-15с). Фаза 2: 2+ SVG-кнопки стабильны 3 сек
8. **Прочитать ответ** — `browser_evaluate('window.__adapter.read()')` → `{ done, textLen, text, source, provider }`

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
│   ├── mode-switcher.js     ← Универсальный переключатель режимов (DeepThink/Agent/Search/Slides/...)
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
│   ├── kimi-features-reference.md ← Kimi: 9 бесплатных функций (от консультации с Kimi)
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

## 🔄 Мультитурновые диалоги

**⚠️ КРИТИЧНО: НЕ создавать новый чат для продолжения обсуждения!**

Все провайдеры хранят контекст на сервере. При продолжении обсуждения той же темы:
1. Оставайтесь на том же URL чата (`chat.z.ai/c/<UUID>`, `chat.qwen.ai/c/<UUID>`, `chat.deepseek.com/a/chat/s/<UUID>`, `kimi.com/chat/<UUID>`)
2. Извлеките UUID из адресной строки браузера: `browser_evaluate('location.href')`
3. Сравните UUID текущей страницы с UUID из лога — если не совпадает, перейдите по нужному URL
4. Если вкладка провайдера уже открыта с нужным UUID — используйте её
5. Если чат был закрыт — найдите UUID в логе (см. шаг 2 Workflow) и перейдите по URL
6. Отправляйте следующее сообщение в тот же чат через `window.__adapter.send()`

**Никогда не открывать новый чат (`chat.z.ai/`, `chat.qwen.ai/`, `chat.deepseek.com/`, `kimi.com/`) без явной необходимости** — это теряет всю историю обсуждения.

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
| **GLM** | ✅ | ✅ 18-492 tok | ✅ | textarea | `/api/v2/chat/completions` | ✅ Agent, DeepThink, Search | ✅ setInputFiles |
| **Qwen** | ✅ | ✅ 1-30 tok | ✅ | textarea | `/api/v2/chat/completions` | ✅ DeepThink, Search | ✅ setInputFiles |
| **DeepSeek** | ✅ | ⚠️ re-override | ✅ | textarea + кнопка | `/api/v0/chat/completion` | ✅ DeepThink, Search, Fast | ✅ setInputFiles (200+ форматов) |
| **Kimi** | ✅ | ❌ gRPC | ✅ | contenteditable | gRPC-web | ✅ Agent Swarm, Deep Research, Code | ❌ нет file input |

---

## 📝 Changelog

### v15.3.0 (current) — Mode Switcher + Kimi Features Integration + Slash Commands

- 🆕 `scripts/mode-switcher.js` — универсальный переключатель режимов всех провайдеров
- 🆕 Режимные триггеры в SKILL.md: DeepThink, Agent, Search, Deep Research, Agent Swarm, Slides, Websites, Docs, Sheets
- 🆕 Workflow обновлён: 7→8 шагов (добавлен режим + файл upload)
- 🆕 `docs/reference/kimi-features-reference.md` — полный обзор 9 функций Kimi
- 🆕 Kimi: Deep Research, Agent Swarm, Slides, Websites, Docs, Sheets, Code, Claw — все через sidebar
- 🆕 DeepSeek: Быстрый/Глубокое мышление/Умный поиск — через клик по кнопке
- 🔥 Kimi slash-команды: `/deep-research`, `/docx`, `/pdf`, `/xlsx` — генерация файлов!
- 🔥 Kimi Code: отдельная страница (kimi.com/code), модель K2.7 Code, CLI через `curl | bash`
- 🔥 Kimi Claw = поиск через 🔍 или slash-команду

### v15.2.0 — Advanced Mode Testing: DeepThink ✅ Agent ✅ Files ✅

- 🆕 GLM File Upload: `setInputFiles()` на скрытый input работает — прочитал файл ✅
- 🆕 DeepSeek File Upload: 200+ форматов, `setInputFiles()` + кнопка Send ✅
- 🆕 Qwen File Upload: `setInputFiles()` на скрытый input работает ✅
- 🆕 DeepSeek DeepThink: "Глубокое мышление" включено, reasoning в ответе ✅
- 🆕 DeepSeek sendMode: 'button' — кнопка отправки вместо Enter ✅
- 🆕 GLM Agent Mode + DeepThink + Web Search — все режимы протестированы ✅
- 🆕 Qwen DeepThink: "Автоматический" (3 опции), thinking selector найден ✅
- 🆕 Kimi: Agent Swarm, Deep Research, Slides, Code — 9 режимов в sidebar ✅
- 🆕 `docs/plans/provider-advanced-testing-results.md` — полный отчёт
- 🆕 Provider status table: добавлены Mode + File колонки

### v15.1.0 — Multi-Provider Testing: GLM ✅ Qwen ✅ DeepSeek ✅ Kimi ✅

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
