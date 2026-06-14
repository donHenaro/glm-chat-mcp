# API Technical Reference

Техническая справка по API провайдеров. Основной документ — SKILL.md.

## GLM API (ZhiPu AI)

**Endpoint:** `POST /api/v2/chat/completions?<fingerprint>`

**Query параметры:** timestamp, requestId, user_id, version=0.0.1, platform=web, token=<JWT>, user_agent, language, timezone, screen_*, viewport_*, signature_timestamp

**Headers:**
- `Authorization: Bearer <JWT>`
- `X-FE-Version: prod-fe-1.1.52`
- `X-Signature: <SHA-256>` — вычисляется встроенной sha.js из минифицированного бандла
- `X-Region: overseas`

**Body:**
```json
{
  "stream": true,
  "model": "GLM-5.1",
  "messages": [{"role": "user", "content": "..."}],
  "signature_prompt": "<prompt>",
  "features": {
    "web_search": false,
    "auto_web_search": false,
    "image_generation": false,
    "enable_thinking": false,
    "reasoning_effort": "medium",
    "flags": []
  }
}
```

⚠️ **X-Signature** — SHA-256 хеш, НЕ пытаться подделать. Использовать UI-отправку.

## GLM SSE формат (собственный, НЕ OpenAI)

```
data: {"type":"chat:completion","data":{"phase":"other","usage":{"prompt_tokens":N,"completion_tokens":N}}}
data: {"type":"chat:completion","data":{"delta_content":"Текст ответа","phase":"answer"}}
data: {"type":"chat:completion","data":{"phase":"done","done":true,"metadata":{...}}}
```

## GLM Features (режимы)

| Режим | Параметры в features |
|-------|---------------------|
| Обычный | `web_search:false, auto_web_search:false` |
| Deep Think | `enable_thinking:true` + `reasoning_effort:"high"/"max"` |
| Web Search | `web_search:true` или `auto_web_search:true` |
| Agent Mode | `flags:["general_agent"]` + `reasoning_effort:"max"` |

## GLM Token извлечение

```javascript
// Из localStorage на chat.z.ai
const jwt = localStorage.getItem('token');
const payload = JSON.parse(atob(jwt.split('.')[1]));
const userId = payload.id || payload.sub;
```

## Qwen API (Alibaba)

**Двухэтапный процесс:**
1. `POST /api/v2/chats/new` → chat_id
2. `POST /api/v2/chat/completions?chat_id=<id>` → SSE stream

⚠️ Messages используют **дерево** (parentId/childrenIds/fid), не простой массив.

**Реальные параметры (перехвачено):**
- model: `qwen3.7-plus` (не qwen-max-latest!)
- chat_type: `t2t` (не t2i!)
- chat_mode: `normal`
- Headers: `Authorization: Bearer <JWT>`, `Version: 0.2.64`, `source: web`
- feature_config: `thinking_enabled:true, auto_thinking:true, thinking_mode:"Auto", auto_search:true`

## DeepSeek API

**Endpoint:** `POST /api/v0/chat/completions`

⚠️ Использует **Proof-of-Work** (create_pow_challenge → solve → completion).

**Auth:** `Bearer <userToken>` из localStorage.userToken.value

**SSE:** OpenAI-совместимый (`choices[].delta.content` / `reasoning_content`)

**Критическое:** `reasoning_content` обязателен (даже пустой) в сообщениях ассистента при tool_calls.

## DeepSeek Token извлечение

```javascript
// Из localStorage на chat.deepseek.com
const token = JSON.parse(localStorage.getItem('userToken')).value;
```

## SSE-intercept (GLM) — для streaming

```javascript
// Установка перехватчика
if (!window.__sseInterceptorInstalled) {
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, opts] = args;
    const response = await origFetch.apply(this, args);
    if (typeof url === 'string' && url.includes('chat/completions')) {
      const origBody = response.body;
      if (origBody) {
        const reader = origBody.getReader();
        const decoder = new TextDecoder();
        const stream = new ReadableStream({
          async start(controller) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { controller.close(); break; }
              const chunk = decoder.decode(value, { stream: true });
              window.__sseChunks.push(chunk);
              controller.enqueue(value);
            }
          }
        });
        return new Response(stream, { status: response.status, headers: response.headers });
      }
    }
    return response;
  };
  window.__sseInterceptorInstalled = true;
}

// Парсинг
const chunks = window.__sseChunks || [];
const fullText = chunks
  .flatMap(c => c.split('\n'))
  .filter(line => line.startsWith('data: '))
  .map(line => { try { return JSON.parse(line.slice(6)); } catch { return null; } })
  .filter(d => d?.type === 'chat:completion' && d?.data?.delta_content)
  .map(d => d.data.delta_content)
  .join('');
```

⚠️ SSE-intercept теряется при навигации (beforeunload от Agent Mode).
Рекомендуется Copy/Regenerate detection + network-hooks.js как основной метод.

## Network Hooks (v14.0) — рекомендованный метод перехвата

`scripts/network-hooks.js` — перехват fetch/EventSource на уровне страницы.

**Преимущества над SSE-intercept:**
- Парсинг GLM-формата (delta_content + phase) из коробки
- Фильтрация thinking vs answer фаз
- Идемпотентная установка (безопасно вызывать многократно)
- Буфер с ограничением памяти (50 записей)
- Сохранение оригинальных API (window.__origFetch) для безопасной переустановки

**API:**
```javascript
window.__netBuffer.stats()        // статистика перехваченных запросов
window.__netBuffer.getLatest()     // последняя запись (url, body, sseTokens, phase)
window.__netBuffer.getLatestTokens()  // answer-токены как строка
window.__netBuffer.getLatestThinking() // thinking-токены как строка
window.__netBuffer.flush()         // очистить буфер
```
