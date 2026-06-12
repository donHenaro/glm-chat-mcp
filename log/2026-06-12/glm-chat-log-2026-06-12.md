# GLM Chat Log — 2026-06-12

| Дата | Время | UUID | Тема | URL | Провайдер | Mode | Статус |
|------|-------|------|------|-----|-----------|------|--------|
| 2026-06-12 | 12:04 | 74d5700a | Интеграция webchat2api — архитектура | https://chat.z.ai/c/74d5700a | GLM | PW | ✅ |
| 2026-06-12 | 12:16 | b534fd07 | GLM chat.py реализация | https://chat.z.ai/c/b534fd07 | GLM | PW | ✅ |
| 2026-06-12 | 12:22 | e8238dd0 | Точный API формат GLM | https://chat.z.ai/c/e8238dd0 | GLM | PW | ✅ |

## Консультация 3: Точный API формат GLM (UUID: e8238dd0)

### Ключевые находки

1. **API Endpoint:** `POST https://internal-api.z.ai/v1/chat/completions`
2. **Обязательные заголовки:**
   - `Authorization: Bearer Z.ai` (фиксированный!)
   - `X-Token: <JWT>` (из localStorage)
   - `X-User-Id: <user_uuid>`
   - `X-Chat-Id: <chat_uuid>`
   - `X-Z-AI-From: Z`
3. **Deep Think:** `"thinking": {"type": "enabled"}`
4. **Web Search:** `"tools": [{"type": "function", "function": {"name": "web_search"}}]`
5. **SSE:** OpenAI-совместимый с `reasoning_content` в delta
6. **Rate limits:** 300/day, 2 QPS, 30/10min
