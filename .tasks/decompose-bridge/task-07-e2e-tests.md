# Task 07: E2E тесты — верификация всех endpoint'ов

**Type:** Verification

## Goal

Запустить `server/test-e2e.js` и убедиться что все 11 тестов проходят после декомпозиции.

## What to Do

1. Запустить сервер: `node server/app.js` в фоне
2. Запустить тесты: `node server/test-e2e.js`
3. Проверить что все 11 тестов проходят:
   - GET /v1/models → 200, data.length >= 6
   - GET /v1/status → 200, status === 'running'
   - GET /metrics → 200, body includes 'glm_chat_requests_total'
   - POST /v1/chat/completions {} → 400
   - POST /v1/chat/completions unknown model → 400
   - GET /v1/status → models includes 'glm-5.1'
   - POST /v1/chat/completions with tools → not 400
   - POST /v1/chat/completions with stream_options → not 400
   - GET /v1/sessions → 200, sessions array
   - GET /v1/models without auth → 200
   - POST /v1/chat/completions real chat → 200 (requires CDP)
4. Если тесты падают — определить причину и исправить

## Files/Areas

- `server/test-e2e.js` — запуск (без изменений)
- `server/app.js` — запуск
- Все route файлы — возможные фиксы

## Key Points

- Тест 11 (real chat) требует запущенного CDP-браузера — может провалиться если CDP недоступен. Это нормально — остальные 10 тестов не требуют браузера.
- Если тесты падают с import errors — проверить что все require() пути правильные.
- Если тесты падают с 404 — проверить что routes смонтированы на правильных путях.

## Done When

- [ ] Сервер запускается без ошибок (`node server/app.js`)
- [ ] Минимум 10 из 11 E2E тестов проходят (тест 11 требует CDP)
- [ ] Все endpoint'ы отвечают с правильными статусами
