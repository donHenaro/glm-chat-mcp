# Task 02: Вынести админ-роуты в routes/admin.js

**Type:** Code Modification

## Goal

Создать `server/routes/admin.js` — модуль со всеми административными/health-check endpoint'ами: GET /v1/models, GET /v1/status, GET /v1/sessions, GET /v1/sessions/:id/history, GET /metrics.

## What to Do

1. Создать `server/routes/admin.js`
2. Экспортировать Express Router с endpoint'ами:
   - `GET /models` → PROVIDERS list (openai-bridge.js lines 212-224)
   - `GET /status` → server status (lines 728-739)
   - `GET /sessions` → list sessions (lines 741-754)
   - `GET /sessions/:id/history` → DOM chat history (lines 756-830)
   - `GET /../../metrics` → Prometheus metrics (lines 636-726)
3. Импортировать:
   - `../../state` — shared state
   - `../services/session` — listSessions, extractPageHistory
   - `../utils/metrics` — formatPrometheus
4. PROVIDERS импортировать из routes/chat.js или config.js

## Files/Areas

- `server/routes/admin.js` — создать (новый файл, ~80 строк)
- `server/openai-bridge.js` — НЕ трогать

## Key Points

- GET /v1/sessions/:id/history содержит ~60 строк DOM extraction — но эта логика уже в `session.js` как `extractPageHistory()`. Использовать существующую функцию.
- GET /metrics уже использует `formatPrometheus()` из `utils/metrics.js` — просто вызвать.
- GET /v1/status возвращает версию — обновить на актуальную (15.3.0)
- PROVIDERS — общий конфиг, нужно импортировать из того же места где он определён.

## Done When

- [ ] `server/routes/admin.js` существует и экспортирует Router
- [ ] Все imports работают (`node -c server/routes/admin.js`)
- [ ] 5 endpoint'ов определены: /models, /status, /sessions, /sessions/:id/history, /metrics
- [ ] DOM extraction использует session.extractPageHistory()
