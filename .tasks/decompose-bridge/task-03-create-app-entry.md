# Task 03: Создать server/app.js — slim entry point

**Type:** Code Modification

## Goal

Создать `server/app.js` — тонкий entry point (~60 строк), который собирает Express-приложение, middleware и routes. Заменит openai-bridge.js как точку входа.

## What to Do

1. Создать `server/app.js` со следующей структурой:
   - JSDoc header (упрощённая версия из openai-bridge.js lines 1-37)
   - Import chromium (Playwright или CloakBrowser) — lines 39-54
   - Configuration: PORT, HEADLESS — lines 56-57
   - Express app + json parser — lines 111-113
   - API Authentication middleware — lines 115-135
   - Rate limiting middleware — из utils/rate-limit.js
   - Mount routes: `app.use('/v1', require('./routes/admin'))`
   - Mount chat: `app.post('/v1/chat/completions', ...)` из routes/chat.js
   - SIGINT handler — lines 630-634
   - app.listen() — lines 832-838
2. Обновить `package.json` start script: `node server/app.js`
3. Обновить `docker-entrypoint.sh` если нужно

## Files/Areas

- `server/app.js` — создать (новый файл, ~60 строк)
- `package.json` — изменить start script
- `docker-entrypoint.sh` — возможно нет изменений (проверить)

## Key Points

- Chromium import (lines 39-54) — определить в app.js и передать в browser.js через параметры
- API auth middleware (lines 115-135) — определить inline в app.js
- Rate limiting — использовать `createRateLimiter()` из utils/rate-limit.js
- PROVIDERS — определить в app.js или config.js, импортировать в routes
- SIGINT handler — вызвать `browser.shutdown()` из services/browser.js

## Done When

- [ ] `server/app.js` существует, экспортирует app, и запускает сервер
- [ ] `node -c server/app.js` — без ошибок
- [ ] package.json start script обновлён на `node server/app.js`
- [ ] API auth middleware и rate limit middleware работают
- [ ] Routes/chat и routes/admin смонтированы
