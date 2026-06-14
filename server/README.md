# glm-chat-mcp OpenAI Bridge Server

OpenAI-совместимый HTTP API для бесплатных чат-провайдеров (GLM, Qwen, DeepSeek) через Playwright.

## Запуск

```bash
# Установка зависимостей
npm install

# Запуск (headless, порт 8102 по умолчанию)
node server/openai-bridge.js

# Запуск с GUI (для отладки)
HEADLESS=false node server/openai-bridge.js

# Свои порт
node server/openai-bridge.js --port=8080

# CloakBrowser stealth-режим
CLOAK=true node server/openai-bridge.js

# Подключение к уже запущенному браузеру MCP Playwright
CDP_URL=http://localhost:9222 node server/openai-bridge.js
```

## Endpoints

### GET /v1/models
Список доступных моделей.

### GET /v1/status
Статус сервера: версия, браузер, сессии, uptime.

### GET /v1/sessions
Активные сессии чатов.

### POST /v1/chat/completions
Основной эндпоинт — OpenAI-совместимый.

```bash
curl http://localhost:8102/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-5.1",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

Streaming:
```bash
curl http://localhost:8102/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-5.1",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

## Доступные модели

| Model | Provider | URL |
|-------|----------|-----|
| glm-5.1 | GLM | chat.z.ai |
| glm-5 | GLM | chat.z.ai |
| glm-4 | GLM | chat.z.ai |
| qwen3 | Qwen | chat.qwen.ai |
| deepseek | DeepSeek | chat.deepseek.com |
| deepseek-chat | DeepSeek | chat.deepseek.com |

## Session Management

Для многоходовых диалогов используйте заголовок `X-Session-Id`:

```bash
# Первый запрос — сервер создаст сессию и вернёт ID в заголовке X-Session-Id
curl -v http://localhost:8102/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5.1","messages":[{"role":"user","content":"My name is Bob"}]}'

# Последующие запросы — передайте session ID для продолжения диалога
curl http://localhost:8102/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess-1234-abc" \
  -d '{"model":"glm-5.1","messages":[{"role":"user","content":"What is my name?"}]}'
```

Сессии автоматически истекают через 30 минут бездействия.

## CloakBrowser (Stealth Mode)

Для обхода детекции ботов:

```bash
npm install cloakbrowser
CLOAK=true CLOAK_HUMANIZE=true node server/openai-bridge.js
```

Опции:
- `CLOAK=true` — включить CloakBrowser
- `CLOAK_HUMANIZE=true` — имитация человеческого поведения (по умолчанию)
- `CLOAK_PROXY=url` — прокси-сервер
- `CLOAK_GEOIP=country` — геолокация

## Интеграция с клиентами

### Cline / Roo-Code
```
Base URL: http://localhost:8102/v1
API Key: any (не проверяется)
Model: glm-5.1
```

### ChatBox
```
API Type: OpenAI
Base URL: http://localhost:8102/v1
API Key: any
Model: glm-5.1
```

### Open WebUI
```
OpenAI API URL: http://localhost:8102/v1
API Key: any
Model ID: glm-5.1
```

## Архитектура

```
Client → POST /v1/chat/completions
  → Express server
    → Playwright: navigate to chat provider
    → Inject network-hooks.js (SSE interception)
    → Type prompt → Enter
    → Poll window.__netBuffer for SSE tokens
    → OpenAINormalizer: GLM SSE → OpenAI SSE
    → Response back to client
```

## Troubleshooting

### Браузер не запускается
```bash
npx playwright install chromium
# ИЛИ подключитесь к MCP Playwright:
CDP_URL=http://localhost:9222 node server/openai-bridge.js
```

### Порт занят
```bash
node server/openai-bridge.js --port=8080
# ИЛИ
PORT=8080 node server/openai-bridge.js
```
