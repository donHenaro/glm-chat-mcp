# Task 05: Обновить docker-entrypoint.sh и package.json

**Type:** Code Modification

## Goal

Обновить docker-entrypoint.sh и package.json для использования нового entry point `server/app.js` вместо `server/openai-bridge.js`.

## What to Do

1. Проверить `package.json` — изменить `scripts.start` на `node server/app.js`
2. Проверить `docker-entrypoint.sh` — если содержит хардкод `openai-bridge.js`, заменить на `app.js`
3. Проверить `Dockerfile` если есть — CMD/ENTRYPOINT

## Files/Areas

- `package.json` — изменить start script
- `docker-entrypoint.sh` — проверить на хардкод
- `Dockerfile` — если есть

## Key Points

- docker-entrypoint.sh использует `exec "$@"` — передаёт CMD из docker-compose. Нужно проверить CMD.
- docker-compose.yml может содержать CMD — проверить.

## Done When

- [ ] package.json start script указывает на `node server/app.js`
- [ ] docker-entrypoint.sh не содержит ссылок на openai-bridge.js
- [ ] Dockerfile/CMD обновлены (если нужно)
