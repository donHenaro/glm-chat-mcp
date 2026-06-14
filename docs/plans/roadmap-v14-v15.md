# План развития glm-chat-mcp v14.0 → v15.0
## На основе анализа аналогов + собственного ревью

Дата: 2026-06-13
Автор: VeAI + GLM (совместная работа)

---

## 1. Статус: Что уже сделано (v14.0)

### Новые модули (реализовано):
- ✅ `scripts/network-hooks.js` — перехват fetch/EventSource, SSE-буфер
- ✅ `scripts/session-manager.js` — persistent sessions через cookies/localStorage
- ✅ `scripts/provider-adapter.js` — унифицированный провайдер-агностик API
- ✅ `scripts/response.js` v14.0 — network buffer как приоритетный источник
- ✅ `SKILL.md` v14.0 — обновлённая архитектура и документация

### Ключевые улучшения:
- Иерархия detection: network buffer (P0) → DOM селекторы (P1)
- Унифицированный API: `window.__adapter.observe/send/read`
- Session persistence: `window.__session.save/restore/status`
- CloakBrowser: документация для опциональной установки

---

## 2. Анализ аналогов — критическая оценка GLM-плана

### Что реально и подтверждено:
| Проект | Статус | Что взять | Наша оценка |
|--------|--------|-----------|-------------|
| CloakBrowser | ✅ 26K⭐, npm v0.3.31 | Stealth Chromium | P0 — реализовано как рекомендация |
| Chat2API | ✅ высокий рейтинг | OpenAI API формат | P2 — будущий HTTP bridge |
| WebModel | ✅ 9 провайдеров | Унифицированный API | P1 — реализовано в provider-adapter.js |
| Stagehand | ⚠️ не найден на GitHub | AI extract() | P1 — fallback через browser_snapshot |
| Steel.dev | ⚠️ не проверен | Session persistence | P0 — реализовано через session-manager.js |
| playwright-extra | ✅ npm v4.3.6, 735K/week | JS stealth | P1 — документация как fallback |

### Что НЕ сработает через MCP Playwright (ограничение архитектуры):
| Фича | Почему недоступна | Альтернатива |
|-------|-------------------|-------------|
| page.route() | Нет в MCP API | ✅ JS injection (network-hooks.js) |
| exposeFunction() | Нет в MCP API | ✅ Poll через browser_evaluate |
| storageState() | Нет в MCP API | ✅ JS-level cookies/localStorage |
| CloakBrowser launch | MCP сервер управляет браузером | ✅ Документация для пользователя |
| CDPSession | Нет в MCP API | ⚠️ browser_network_requests |

### Собственное дополнение к GLM-плану:
1. **provider-adapter.js** — GLM не предусмотрел унифицированный адаптер как отдельный модуль
2. **Идемпотентность всех скриптов** — безопасно вызывать многократно (GLM не упомянул)
3. **Memory limits в netBuffer** — 50 записей max (GLM не учёл утечки памяти)
4. **Session validation** — проверка возраста < 7 дней (GLM не учёл устаревание)

---

## 3. Fork от GLM — проверка

❌ **Fork НЕ создан.** На GitHub 0 форков репозитория donHenaro/glm-chat-mcp.
GLM упомянул о планах сделать fork, но не реализовал.

---

## 4. План доработок (v14.0 → v15.0)

### ✅ P1 — ЗАВЕРШЕНО (все 5 пунктов)

#### ✅ 4.1 AI-extract fallback (реализовано)
- ai-extract.js: 5 стратегий (network → selectors → roles → containers → longest-prose)
- Тест: ai-extract.diagnose() нашёл ответ через selector:.markdown-prose

#### ✅ 4.2 Улучшение progress-monitor.js (реализовано)
- progress-monitor.js v14: network-aware (phase, progress%, ETA, netDone vs domDone)
- Тест: phase=complete, source=network (DOM ещё spinner!)

#### ✅ 4.3 Debug tracing (реализовано)
- debug-trace.js: log/error/success/startTimer/endTimer/dump/stats/clear/export

#### ✅ 4.4 Auto-init при первом обращении (реализовано)
- hooks-auto-init.js: единая точка входа, auto-init hooks + trace + adapters
- SKILL.md: обновлён workflow

#### ✅ 4.5 Multi-provider интеграция с adapter (реализовано)
- multi-provider.js v14: adapter.send() когда доступен
- multi-collect.js: adapter → network → ai-extract → DOM

### ✅ P2 — ЗАВЕРШЕНО (все 4 пункта)

#### ✅ 4.6 OpenAI-совместимый API слой (реализовано)
- server/openai-bridge.js: Express + Playwright
- GET /v1/models, GET /v1/status, GET /v1/sessions
- POST /v1/chat/completions (stream + non-stream)
- 6 моделей: glm-5.1, glm-5, glm-4, qwen3, deepseek, deepseek-chat
- CDP auto-discovery + session management + conversation context reuse
- Тест: /v1/status → {status:'running', version:'14.3.0', 6 models}
- Тест: OpenAI completion → {content:'Париж', reasoning_content:'...', finish_reason:'stop'}

#### ✅ 4.7 CloakBrowser MCP сервер (реализовано)
- server/cloak-browser-mcp.js: stdio JSON-RPC, 6 tools
- Falls back to playwright if cloakbrowser not installed
- server/package-cloak.json

#### ✅ 4.8 CDP interception (реализовано)
- scripts/cdp-intercept.js: WebSocket interception + EventSource fallback
- window.__wsBuffer.extractResponse() для WS-based провайдеров

#### ✅ 4.9 HTTP bridge standalone (реализовано)
- server/openai-bridge.js: Express standalone server
- server/README.md: полная документация
- CloakBrowser mode: CLOAK=true

---

## 5. Вопросы для GLM

1. Fork не создан — сделать его сейчас или работать в origin?
2. network-hooks.js — проверить на реальном GLM чате (перехватывает ли SSE?)
3. provider-adapter.js — нужны ли дополнительные провайдеры (Kimi, MiniMax)?
4. CloakBrowser — стоит ли делать кастомный MCP сервер или достаточно документации?
5. OpenAI API слой — приоритет или подождать?
