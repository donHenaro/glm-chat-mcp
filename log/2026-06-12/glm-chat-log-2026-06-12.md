# GLM Chat Log — 2026-06-12

| Дата | Время | UUID | Тема | URL | Провайдер | Статус |
|------|-------|------|------|-----|-----------|--------|
| 2026-06-12 | 12:04 | 74d5700a-1207-4880-989c-677fd05035c7 | Интеграция webchat2api в MCP-скилл — консультация по архитектуре | https://chat.z.ai/c/74d5700a-1207-4880-989c-677fd05035c7 | GLM | ✅ |

## Резюме ответа GLM-5.1

### 1. АРХИТЕКТУРА: Dual-mode (Playwright primary + API fallback)
- Playwright стабильнее для GLM: UI эволюционирует, API-прокси будет отставать
- Cookie-сессии GLM имеют нестандартный refresh (token + session_id + /api/user/refresh)
- Agent Mode — оркестрация tool-calls, сложна для API-прокси
- Fallback: API → Playwright (при 5xx/timeout)

### 2. РАСШИРЕНИЕ webchat2api — реально, но со сложностями
- 3 главных вызова: cookie-авторизация, SSE-диалект, rate-limit/bot-детекция
- GLM: token cookie + /api/user/refresh — средняя сложность
- Qwen: chatqwen_ticket + CSRF-token — высокая (CSRF меняется на каждой странице)
- DeepSeek: session_token + JWT с коротким TTL (~1ч) — высокая

### 3. МАППИНГ РЕЖИМОВ: модель-параметры, не отдельные эндпоинты
- `glm-5.1-deepthink` → reasoning_content
- `glm-5.1-agent` → tool_calls
- `glm-5.1-search` → web search tool
- Hybrid: model-суффиксы + extra_body-параметры

### 4. АВТОРИЗАЦИЯ: Cookie-менеджмент
- GLM: POST /api/user/refresh, GET /api/user/info для валидации
- Qwen: CSRF из meta-тега + chatqwen_ticket
- DeepSeek: JWT refresh loop

### 5. ПРИОРИТЕТЫ (фазы)
- Фаза 1 (3 дня): GLM provider в webchat2api (порт ZtoApi)
- Фаза 2 (5 дней): SKILL.md dual-mode + fallback-chain
- Фаза 3 (5-8 дней): Qwen provider + DeepSeek provider
- Фаза 4 (3-5 дней): Мониторинг, auto-fallback, cookie rotation
