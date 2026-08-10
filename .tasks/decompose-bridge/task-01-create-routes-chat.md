# Task 01: Вынести POST /v1/chat/completions в routes/chat.js

**Type:** Code Modification

## Goal

Создать `server/routes/chat.js` — самодостаточный модуль с основным endpoint'ом POST /v1/chat/completions, использующий существующие сервисы вместо дублирующегося кода из монолита.

## What to Do

1. Создать `server/routes/chat.js`
2. Экспортировать Express Router с POST /v1/chat/completions
3. Импортировать существующие модули:
   - `../../state` — shared state
   - `../services/browser` — getOrCreateContext
   - `../services/cache` — cacheHash, cacheGet, cacheSet
   - `../services/session` — cleanExpiredSessions, findAutoReuseSession, findSessionByProviderUrl, createSessionId
   - `../services/helpers` — estimateTokens, buildToolPrompt, parseToolCalls
   - `../services/streaming` — injectHooks, flushBuffer, sendPrompt
   - `../utils/metrics` — metrics
4. Перенести всю логику из openai-bridge.js lines 226-538:
   - Валидация body (messages, model)
   - Session resolution (x-session-id, auto-reuse, URL routing)
   - Function calling emulation (tools → prompt)
   - Cache check (non-streaming)
   - Browser context + page management
   - Navigation
   - Hook injection + prompt sending
   - SSE streaming loop (lines 517-538)
   - Non-streaming polling loop
   - parseToolCalls для response
   - Error handling + auto-retry
5. Перенести CONFIG из монолита: PROVIDERS, DEFAULT_MODEL, TIMEOUT_MS, RETRY_PROVIDERS

## Files/Areas

- `server/routes/chat.js` — создать (новый файл, ~300 строк)
- `server/openai-bridge.js` — НЕ трогать (монолит будет удалён позже)

## Key Points

- Streaming loop (SSE polling) и non-streaming polling — самая большая часть (~200 строк). Перенести без изменений.
- Error handling с auto-retry использует `app.handle(req, res)` — это нужно сохранить.
- CONFIG (PROVIDERS, TIMEOUT_MS и т.д.) определить в начале chat.js или вынести в `server/config.js`.
- session.messages tracking: session.js не имеет pushMessage() — либо добавить, либо оставить inline.

## Done When

- [ ] `server/routes/chat.js` существует и экспортирует Router
- [ ] Все imports работают без ошибок (`node -c server/routes/chat.js`)
- [ ] Логика POST /v1/chat/completions полностью перенесена (валидация, session, cache, streaming, non-streaming, error handling)
- [ ] Конфигурация (PROVIDERS, TIMEOUT_MS) определена в модуле
