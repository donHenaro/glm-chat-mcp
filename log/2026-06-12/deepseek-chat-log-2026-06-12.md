# DeepSeek Chat Log — 2026-06-12

| Дата | Время | UUID | Тема | URL | Провайдер | Mode | Статус |
|------|-------|------|------|-----|-----------|------|--------|
| 2026-06-12 | 12:30 | 735ff162 | DeepSeek API спецификация | https://chat.deepseek.com/a/chat/s/735ff162 | DeepSeek | API | ✅ |

## Консультация: DeepSeek API спецификация

### Ключевые находки

1. **Два варианта API:**
   - **Официальный API** (платный): `POST https://api.deepseek.com/chat/completions`, Bearer `sk-...`
   - **Веб-чат** (бесплатный): `POST https://chat.deepseek.com/api/v0/chat/completions`, session token

2. **Deep Think (R1):**
   - `model: "deepseek-reasoner"` + `thinking: {type: "enabled"}`
   - Альтернатива: `deepseek-chat` + `reasoning_effort: "high"`

3. **SSE формат:** OpenAI-совместимый
   - `reasoning_content` в delta для reasoning
   - ⚠️ **КРИТИЧЕСКОЕ**: `reasoning_content` **обязателен** (даже пустой) в messages ассистента при tool_calls — иначе HTTP 400!

4. **Tool calling:** Стандартный OpenAI-формат, но с обязательным `reasoning_content`

5. **Авторизация веб-чата:** Session token из cookie (session_token)
