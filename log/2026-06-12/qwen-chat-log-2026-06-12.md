# Qwen Chat Log — 2026-06-12

| Дата | Время | UUID | Тема | URL | Провайдер | Mode | Статус |
|------|-------|------|------|-----|-----------|------|--------|
| 2026-06-12 | 12:05 | 9999cf8a | Интеграция webchat2api — архитектура | https://chat.qwen.ai/c/9999cf8a | Qwen | API | ✅ |
| 2026-06-12 | 12:17 | 25afd4a7 | Qwen chat.py реализация — API спецификация | https://chat.qwen.ai/c/25afd4a7 | Qwen | API | ✅ |

## Консультация 2: Qwen API спецификация (UUID: 25afd4a7)

### Ключевое открытие: Двухэтапный процесс!

Qwen использует двухэтапный процесс для чата:

**Шаг 1: Создание чата**
```
POST https://chat.qwen.ai/api/v2/chats/new
Authorization: Bearer <JWT>
Body: {"title": "New Chat", "models": ["qwen-max-latest"], "chat_mode": "local", "chat_type": "t2i", "timestamp": ...}
Response: {"data": {"id": "chat-uuid-xxxxx"}}
```

**Шаг 2: Chat Completions**
```
POST https://chat.qwen.ai/api/v2/chat/completions?chat_id=chat-uuid-xxxxx
Authorization: Bearer <JWT>
Headers: source: web, Version: 0.1.13, bx-v: 2.5.31, Origin, Referer
Body: {"model": "qwen-max-latest", "messages": [...], "stream": true, "chat_id": "chat-uuid-xxxxx", "web_search": false, "thinking": false}
```

### Обязательные заголовки
- Authorization: Bearer JWT
- Cookie: cna, cnaui, ssxmod_itna, ssxmod_itna2
- source: web
- Version: 0.1.13
- bx-v: 2.5.31
- Origin: https://chat.qwen.ai
- Referer: https://chat.qwen.ai/c/guest

### Web Search
- Параметр в body: `"web_search": true`
- Отдельные модели с суффиксом -search

### Thinking (Reasoning)
- Параметр в body: `"thinking": true` (для qwq-32b)

### Refresh Token
- Токены истекают быстрее чем GPT
- Нужен автоматический refresh механизм
