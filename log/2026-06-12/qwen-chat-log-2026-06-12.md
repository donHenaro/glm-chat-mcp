# Qwen Chat Log — 2026-06-12

| Дата | Время | UUID | Тема | URL | Провайдер | Статус |
|------|-------|------|------|-----|-----------|--------|
| 2026-06-12 | 12:05 | 9999cf8a-e353-407c-a56b-014d37bf966a | Интеграция webchat2api — консультация по Qwen/DeepSeek provider | https://chat.qwen.ai/c/9999cf8a-e353-407c-a56b-014d37bf966a | Qwen | ✅ |

## Резюме ответа Qwen

### 1. QWEN-PROVIDER
- Авторизация: Bearer Token (JWT) + cookies (cna, cnaui, token)
- Endpoint: https://chat.qwen.ai/api/v1/chat/completions (SSE streaming)
- Модели: qwen-max-latest, qwen-plus-latest, qwen-turbo-latest, qwq-32b (reasoning), qwen2.5-coder-32b, qwen2.5-vl-32b
- Структура: services/providers/qwen/ (models.py, accounts.py, chat/client.py)

### 2. WEB SEARCH: параметр, не модель
- Рекомендация: extra_body.enable_search = true
- Альтернатива: model-суффиксы (qwen-max-latest-search)
- Qwen возвращает web_search_info → маппить в url_citation

### 3. DUAL-MODE: API-first с Playwright fallback
- Qwen имеет стабильный SSE endpoint, не требует рендеринга
- Нет Cloudflare challenges (в отличие от Grok)
- Playwright fallback при 401/403 + failed refresh

### 4. DEEPSEEK: очень похож на Qwen
- Endpoint: https://chat.deepseek.com/api/v0/chat/completions
- Копипаст Qwen provider с минимальными изменениями
- Нет веб-поиска (проще)
- Токены живут дольше (стабильнее)

### 5. ПРИОРИТЕТЫ (по неделям)
- Неделя 1: GLM provider (порт ZtoApi) + базовая инфраструктура
- Неделя 2: Qwen provider + web search
- Неделя 3: DeepSeek + финализация

### Риски
- Qwen токены быстро истекают → автоматический refresh + Playwright fallback
- Cloudflare → proxies + rotate UA
- Rate limiting → пул аккаунтов + ротация
