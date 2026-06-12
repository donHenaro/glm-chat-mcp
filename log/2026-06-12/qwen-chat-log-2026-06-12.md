# Qwen Chat Log — 2026-06-12

| Дата | Время | UUID | Тема | URL | Провайдер | Mode | Статус |
|------|-------|------|------|-----|-----------|------|--------|
| 2026-06-12 | 12:05 | 9999cf8a | Интеграция webchat2api — архитектура | https://chat.qwen.ai/c/9999cf8a | Qwen | API | ✅ |
| 2026-06-12 | 12:17 | 25afd4a7 | Qwen chat.py реализация — API спецификация | https://chat.qwen.ai/c/25afd4a7 | Qwen | API | ✅ |

## Консультация 2: Qwen API спецификация (UUID: 25afd4a7)

### Ключевое открытие: Двухэтапный процесс!

**Шаг 1:** Создать чат
```
POST https://chat.qwen.ai/api/v2/chats/new
Authorization: Bearer <JWT>
Body: {"title": "New Chat", "models": ["qwen-max-latest"], "chat_mode": "local", "chat_type": "t2i", "timestamp": <ms>}
Response: {"data": {"id": "chat-uuid-xxxxx"}}
```

**Шаг 2:** Chat completion с chat_id
```
POST https://chat.qwen.ai/api/v2/chat/completions?chat_id=<chat_uuid>
Authorization: Bearer <JWT>
Required headers: source: web, Version: 0.1.13, bx-v: 2.5.31
Body: {"model": "qwen-max-latest", "messages": [...], "stream": true, "chat_id": "<chat_uuid>"}
```

### Режимы
- Web Search: `"web_search": true`
- Reasoning: `"thinking": true` + model `"qwq-32b"`
