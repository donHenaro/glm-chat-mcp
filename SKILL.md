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
# GLM Chat MCP Skill v15.3.0 — Network Intelligence + OpenAI Bridge
---

Browser-automation skill for consulting GLM, Qwen, DeepSeek, and Kimi via Playwright. Intercepts SSE responses at the network level (fetch/EventSource hooks), provides unified provider-adapter API, and exposes OpenAI-compatible HTTP bridge (`/v1/chat/completions`, `/v1/models`).

---

## 🔴 Обязательная активация

| Провайдер | Триггеры |
|-----------|----------|
| **GLM** | `zai`, `спроси glm`, `ask glm`, `реализуй`, `создай`, `агент`, `исследуй`, `agent` |
| **Qwen** | `qwen`, `спроси qwen`, `ask qwen`, `обсуди с qwen` |
| **DeepSeek** | `deepseek`, `спроси deepseek`, `ask deepseek` |
| **Kimi** | `kimi`, `спроси kimi`, `ask kimi` |
| **Все** | `спроси всех`, `обсуди со всеми`, `мнение экспертов`, `консенсус`, `все провайдеры` |

### Режимные триггеры

| Режим | Триггеры | Провайдер |
|-------|----------|-----------|
| **DeepThink** | `подумай глубоко`, `deep think`, `глубокое мышление` | GLM, Qwen, DeepSeek |
| **Agent Mode** | `agent mode`, `агент режим`, `выполни` | GLM, Kimi |
| **Web Search** | `поиск в интернете`, `web search`, `найди в сети` | GLM, DeepSeek, Qwen, Kimi(Claw) |

Kimi расширенные режимы (Agent Swarm, Deep Research, Slides, Websites, Docs, Sheets, Code, slash-команды) → `docs/reference/kimi-features-reference.md`

⛔ Не закрывать браузер после консультации
✅ Браузер уже открыт — сначала проверить состояние
📁 JS-скрипты в `scripts/` — загружать через `read_file` → `browser_evaluate`

---

## 🔄 Workflow — 5 шагов

1. **Найти или создать чат** — `log/YYYY-MM-DD/<provider>-chat-log-YYYY-MM-DD.md` → перейти на вкладку провайдера
2. **Включить режим / загрузить файл** — `window.__modeSwitch.switch("deepThink")`; файл: `page.$('input[type="file"]').setInputFiles(path)`
3. **Отправить сообщение** — `browser_evaluate('window.__adapter.send("text")')` — устанавливает текст в DOM (не `browser_type` — отправляет построчно)
4. **Ждать завершения** — spinner/Stop → 2+ SVG-кнопки стабильны 3 сек
5. **Прочитать ответ** — `browser_evaluate('window.__adapter.read()')` → `{ done, textLen, text, source, provider }`

---

## 🆕 Порядок инициализации (v15.3.0+)

1. `browser_evaluate(filename='hooks-auto-init.js')` — **Единая точка входа**: network hooks + debug trace + adapters
2. `browser_evaluate(filename='provider-adapter.js')` — унифицированный API + SSE адаптеры
3. `browser_evaluate(filename='session-manager.js')` — если нужна session persistence

После инициализации:
- `window.__adapter.observe()` — полная диагностика
- `window.__adapter.read()` — чтение ответа (adapter → network → DOM)
- `window.__adapter.healthCheck()` — проверка всех систем
- `window.__session.status()` — статус авторизации
- `window.__netBuffer.stats()` — статистика перехваченных запросов

---

## 🔄 Мультитурновые диалоги

**⚠️ КРИТИЧНО: НЕ создавать новый чат для продолжения обсуждения!**

Все провайдеры хранят контекст на сервере. Используйте тот же URL чата (`chat.z.ai/c/<UUID>`, `chat.qwen.ai/c/<UUID>`, `chat.deepseek.com/a/chat/s/<UUID>`, `kimi.com/chat/<UUID>`). Извлеките UUID из `browser_evaluate('location.href')` и сравните с логе. Никогда не открывать новый чат без явной необходимости — это теряет всю историю.

---

## 📖 Документация

| Документ | Содержание |
|----------|-----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Network Hooks, Provider Adapters, OpenAI Bridge, Sessions, AI-Extract, Response Detection |
| [docs/API.md](docs/API.md) | OpenAI Bridge API: endpoints, streaming, function calling, auth |
| [docs/reference/kimi-features-reference.md](docs/reference/kimi-features-reference.md) | Kimi: 9 функций (Agent Swarm, Deep Research, Code, slash-команды) |

Полный Changelog → `docs/history/log-index.md`
