# Task 06: Удалить openai-bridge.js (после верификации)

**Type:** Code Modification

## Goal

Удалить монолитный `server/openai-bridge.js` после того как все модули созданы, протестированы и работают.

## What to Do

1. Убедиться что:
   - `server/app.js` существует и запускается
   - `server/routes/chat.js` существует и работает
   - `server/routes/admin.js` существует и работает
   - Все 11 E2E тестов из test-e2e.js проходят
2. Удалить `server/openai-bridge.js`
3. Проверить что никаких ссылок на openai-bridge.js не осталось:
   - README.md
   - docker-compose.yml
   - package.json
   - docker-entrypoint.sh
   - Другие файлы

## Files/Areas

- `server/openai-bridge.js` — удалить
- Все файлы проекта — проверить на ссылки

## Key Points

- **Критический шаг** — необратимое удаление. Только после успешных тестов.
- Использовать `grep -r "openai-bridge"` для поиска оставшихся ссылок.

## Done When

- [ ] `server/openai-bridge.js` удалён
- [ ] `grep -r "openai-bridge" .` не находит ссылок (кроме истории/коммитов)
- [ ] `node -c server/app.js` — без ошибок
- [ ] Все 11 E2E тестов проходят
