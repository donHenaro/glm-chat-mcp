# План развития glm-chat-mcp v14.3 → v15.0
## P3 — Production Hardening (по GLM + VeAI)

Дата: 2026-06-14
Автор: VeAI + GLM (совместная работа, чат /c/49008091)

---

## ✅ P1 + P2 — ЗАВЕРШЕНО

См. План_v14_v15_совместный.txt — все 9 задач выполнены и протестированы.

---

## P3.1: Production Hardening (3 дня)

### 3.1.1 API Auth & Rate Limiting (0.5 дня)
- [ ] Bearer token middleware для openai-bridge.js
- [ ] API ключи из env: `API_KEYS=key1,key2,key3`
- [ ] Rate limiting per key (express-rate-limit)
- [ ] 401/429 ошибки в OpenAI-формате

### 3.1.2 Browser Context Pool (1 день)
- [ ] Пул контекстов (generic-pool или самописный)
- [ ] N "чистых" контекстов готовы к работе
- [ ] После использования — закрыть/переинициализировать (утечки памяти)
- [ ] Ускорение: 5-10 сек → 1-2 сек на повторный запрос

### 3.1.3 Smart In-Memory Cache (0.5 дня)
- [ ] Кэш ответов по хешу prompt
- [ ] TTL: 5 минут
- [ ] Опционально: semantic cache (эмбеддинги)

### 3.1.4 Auto-Retry & Fallback (1 день)
- [ ] При ошибке Cloudflare → переключение на другой провайдер
- [ ] При ошибке DOM extraction → fallback на llm-extract-vision (скриншот + OCR)
- [ ] Экспоненциальный backoff

---

## P3.2: Compatibility & Integration (3 дня)

### 3.2.1 E2E тест с Cline/ChatBox (1 день)
- [ ] Настроить Cline → localhost:8102/v1
- [ ] Тест: отправка запроса, получение ответа, стриминг
- [ ] Тест: function_calling (если Cline требует)

### 3.2.2 Qwen/DeepSeek адаптеры (1 день)
- [ ] QwenAdapter: парсинг SSE формата Qwen
- [ ] DeepSeekAdapter: парсинг SSE формата DeepSeek
- [ ] Тест на реальных чатах

### 3.2.3 Function Calling эмуляция (1 день)
- [ ] Маппинг tool_calls → prompt-инструкции
- [ ] Парсинг JSON-ответа → tool_calls в OpenAI-формате
- [ ] Тест с Cline

### 3.2.4 Token Streaming Accuracy (0.5 дня)
- [ ] Корректный подсчёт usage: {prompt_tokens, completion_tokens}
- [ ] В финальном чанке [DONE]

---

## P3.3: DevOps & Observability (3 дня)

### 3.3.1 Docker + Docker Compose (1 день)
- [ ] Dockerfile с Xvfb + Playwright + Node.js
- [ ] docker-compose.yml с портами 8102
- [ ] Преднастроенный Xvfb для headless

### 3.3.2 VNC / Live Preview (1 день)
- [ ] x11vnc для подключения к браузеру
- [ ] Полезно для дебага сложных запросов

### 3.3.3 Video Recording (0.5 дня)
- [ ] Playwright video recording при ошибках
- [ ] Скриншот последнего состояния
- [ ] debug_info в ответе API

### 3.3.4 Prometheus /metrics (0.5 дня)
- [ ] Время ответа провайдера
- [ ] Процент успешных обходов
- [ ] RAM/CPU воркеров
- [ ] Количество активных контекстов

---

## Приоритет старта (по GLM): P3.1 → P3.2 → P3.3

GLM советует начать с Production Hardening (auth + pool + cache + retry),
потому что без этого система не готова к реальным пользователям.
