# OpenAI Bridge API Reference

> HTTP API reference for the GLM Chat MCP OpenAI-compatible bridge.
> For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md). For quick-start, see [../SKILL.md](../SKILL.md).

---

## Base URL

```
http://localhost:{PORT}
```

Default port: `3000` (configurable via `PORT` env variable).

---

## Endpoints

### `GET /v1/models`

List available models.

**Response:**

```json
{
  "object": "list",
  "data": [
    { "id": "glm-5.1", "object": "model", "owned_by": "glm", "created": 1700000000 },
    { "id": "glm-5",   "object": "model", "owned_by": "glm", "created": 1700000000 },
    { "id": "glm-4",   "object": "model", "owned_by": "glm", "created": 1700000000 },
    { "id": "qwen3",   "object": "model", "owned_by": "qwen", "created": 1700000000 },
    { "id": "deepseek","object": "model", "owned_by": "deepseek", "created": 1700000000 },
    { "id": "deepseek-chat","object": "model", "owned_by": "deepseek", "created": 1700000000 }
  ]
}
```

---

### `POST /v1/chat/completions`

Create a chat completion. Supports both streaming and non-streaming.

**Request Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | If `API_KEYS` set | `Bearer <api_key>` |
| `Content-Type` | Yes | `application/json` |
| `X-Session-Id` | No | Reuse existing session (30-min TTL) |

**Request Body:**

```json
{
  "model": "glm-5.1",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false,
  "stream_options": { "include_usage": true },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string" }
          }
        }
      }
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model ID (see /v1/models) |
| `messages` | array | Yes | Chat messages (OpenAI format) |
| `stream` | boolean | No | `true` for SSE streaming (default: `false`) |
| `stream_options` | object | No | `{ include_usage: true }` adds usage in final chunk |
| `tools` | array | No | OpenAI function calling tools |
| `temperature` | number | No | Accepted but not forwarded (UI-based) |
| `max_tokens` | number | No | Accepted but not forwarded (UI-based) |

**Non-Streaming Response:**

```json
{
  "id": "chatcmpl-<uuid>",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "glm-5.1",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?",
        "reasoning_content": null,
        "tool_calls": null
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 7,
    "total_tokens": 16
  }
}
```

**With Deep Think (reasoning):**

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Париж",
        "reasoning_content": "Столица Франции — это Париж..."
      },
      "finish_reason": "stop"
    }
  ]
}
```

**With Function Calling:**

When `tools` are provided, the bridge injects a system prompt describing available tools. The model may generate `<tool_call>` JSON blocks in its response, which are parsed into `tool_calls`:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_<hash>",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"Paris\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

---

### Streaming Format

When `stream: true`, the response is Server-Sent Events (SSE):

```
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1700000000,"model":"glm-5.1","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1700000000,"model":"glm-5.1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1700000000,"model":"glm-5.1","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1700000000,"model":"glm-5.1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1700000000,"model":"glm-5.1","choices":[{"index":0,"delta":{}}],"usage":{"prompt_tokens":9,"completion_tokens":2,"total_tokens":11}}

data: [DONE]
```

**With `stream_options: { include_usage: true }`:** usage stats appear in the final chunk before `[DONE]`.

**Reasoning content in streaming:**

```
data: {"choices":[{"delta":{"reasoning_content":"Let me think..."}}]}
data: {"choices":[{"delta":{"content":"The answer is..."}}]}
```

---

### `GET /v1/status`

Server status and version info.

**Response:**

```json
{
  "version": "15.0.0",
  "models": 6,
  "cdp": "connected",
  "uptime": 3600
}
```

---

### `GET /v1/sessions`

List active sessions.

**Response:**

```json
{
  "sessions": [
    {
      "id": "<session-uuid>",
      "created": 1700000000,
      "lastActivity": 1700001000,
      "page": "https://chat.z.ai/c/<uuid>"
    }
  ]
}
```

Sessions have a 30-minute TTL. Reuse via `X-Session-Id` header.

---

### `GET /metrics`

Server metrics (if enabled).

**Response:**

```json
{
  "requests": { "total": 42, "success": 40, "errors": 2 },
  "cache": { "hits": 10, "misses": 32, "size": 5 },
  "rateLimit": { "active": 0 }
}
```

---

## Authentication

When `API_KEYS` env variable is set, requests require authentication:

```
Authorization: Bearer sk-your-api-key
```

or via query parameter:

```
?key=sk-your-api-key
```

When `API_KEYS` is not set, authentication is disabled (open access).

---

## Rate Limiting

When auth is enabled, rate limiting is per-key:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Window reset time (Unix) |

**429 Response:**

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "rate_limit_error",
    "code": 429
  }
}
```

---

## Response Cache

In-memory cache with configurable TTL:

- Cache key: hash of (model + messages)
- Default TTL: 5 minutes
- LRU eviction when full

---

## Auto-Retry & Cross-Provider Fallback

If the primary provider fails, the bridge automatically retries with a fallback:

| Primary | Fallback |
|---------|----------|
| GLM | DeepSeek |
| DeepSeek | GLM |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `CDP_URL` | auto-discover | Chrome DevTools Protocol URL (scans 9222-9223) |
| `API_KEYS` | (empty) | Comma-separated API keys. If empty, auth is disabled |
| `RATE_LIMIT_WINDOW` | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | `30` | Max requests per window per key |
| `CACHE` | `true` | Enable response cache |
| `CACHE_TTL` | `300000` | Cache TTL in ms (5 min) |
| `CLOAK` | `false` | Use CloakBrowser instead of Playwright |
| `CLOAK_HUMANIZE` | `false` | Human-like input delays |
| `CLOAK_PROXY` | (empty) | Proxy for CloakBrowser |
| `CLOAK_GEOIP` | (empty) | GeoIP spoofing for CloakBrowser |

---

## Provider-Specific Modes

| Mode | GLM | Qwen | DeepSeek |
|------|-----|------|----------|
| Standard | default | `thinking_enabled:false` | `deepseek-chat` |
| Deep Think | `enable_thinking:true` + `reasoning_effort:"max"` | `thinking_enabled:true, thinking_mode:"Deep"` | `deepseek-reasoner` |
| Web Search | `web_search:true` | `auto_search:true` | Search toggle |
| Agent | `flags:["general_agent"]` | — | — |

---

## Token Estimation

The bridge uses a char→token heuristic for `usage` fields:

- **English:** 4 chars ≈ 1 token
- **CJK:** 1.5 chars ≈ 1 token

This is an approximation, not an exact count.

---

## Error Responses

All errors follow OpenAI format:

```json
{
  "error": {
    "message": "Model not found",
    "type": "invalid_request_error",
    "code": 404
  }
}
```

| HTTP Code | Type | Description |
|-----------|------|-------------|
| 400 | `invalid_request_error` | Missing/invalid parameters |
| 401 | `authentication_error` | Invalid or missing API key |
| 404 | `invalid_request_error` | Model not found |
| 429 | `rate_limit_error` | Rate limit exceeded |
| 500 | `server_error` | Internal bridge error |
| 502 | `server_error` | Provider unavailable |
