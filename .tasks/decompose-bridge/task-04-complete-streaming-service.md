# Task 04: Дополнить services/streaming.js — SSE polling логика

**Type:** Code Modification

## Goal

Перенести логику SSE streaming polling и non-streaming response polling из openai-bridge.js в services/streaming.js. На данный момент streaming.js содержит только injectHooks, flushBuffer, sendPrompt — но не содержит основную polling логику.

## What to Do

1. Добавить в `server/services/streaming.js` следующие функции:
   - `streamResponse(page, res, chatId, model, providerAdapter, messages, toolDefinitions, promptTokens, includeStreamUsage)` — SSE streaming loop (openai-bridge.js lines 517-538)
   - `pollResponse(page, chatId, model, providerAdapter, messages, toolDefinitions, promptTokens)` — non-streaming polling
2. Обе функции используют:
   - `page.evaluate()` для polling network buffer
   - `estimateTokens()` из helpers.js
   - `parseToolCalls()` из helpers.js
   - DOM fallback для Kimi/DeepSeek (`useDomFallback`)
3. Экспортировать новые функции

## Files/Areas

- `server/services/streaming.js` — дополнить (с ~101 до ~200 строк)

## Key Points

- Streaming loop (lines 517-538) — polling каждые 500ms, отправка SSE chunks, финальный chunk с finish_reason, optional usage chunk
- Non-streaming polling — аналогичный цикл но собирает ответ полностью, затем формирует JSON response
- DOM fallback логика (`useDomFallback = providerAdapter === 'kimi' || ...`) — перенести в streaming.js
- `estimateTokens()` helper уже в helpers.js — импортировать оттуда

## Done When

- [ ] `streamResponse()` функция существует и экспортируется
- [ ] `pollResponse()` функция существует и экспортируется
- [ ] `node -c server/services/streaming.js` — без ошибок
- [ ] routes/chat.js может импортировать и использовать обе функции
