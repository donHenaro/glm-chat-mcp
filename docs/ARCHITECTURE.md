# Architecture — GLM Chat MCP

> Detailed technical documentation for the GLM Chat MCP skill.
> For API reference, see [API.md](./API.md). For quick-start, see [../SKILL.md](../SKILL.md).

---

## 🏛️ Two-Level Strategy

**Network Intelligence + UI-отправка** — двухуровневая стратегия:

| Уровень | Метод | Надёжность | Когда использовать |
|---------|-------|:----------:|-------------------|
| 🥇 1 | Network interception (fetch/EventSource) | ⭐⭐⭐⭐⭐ | Основной — не зависит от DOM |
| 🥈 2 | DOM-селекторы + fallback-цепочки | ⭐⭐⭐ | Fallback — если network hooks не установлены |

Все 3 провайдера используют защитные механизмы (X-Signature, PoW, Message Tree),
поэтому прямой API **не рекомендуется**. Отправка через UI — подписи обрабатываются автоматически.

---

## 🌐 Network Hooks (v14+)

**File:** `scripts/network-hooks.js`

Network interception at the page level — intercepts `fetch` and `EventSource` before the browser processes them.

### SSE Interception

- Patches `window.fetch` to intercept SSE responses via `Response.tee()`
- One branch streams to the original consumer (page still works normally)
- Other branch is read by our code → tokens buffered in `window.__netBuffer`
- EventSource constructor is also patched for native SSE endpoints

### Auto-Parse Pipeline

```
GLM SSE → hooks → body → auto-parse → adapter → normalizer → OpenAI SSE
```

1. `fetch()` intercepted → `response.tee()` → one stream to page, one to buffer
2. SSE tokens parsed from intercepted stream (`choices[0].delta.content` or GLM format)
3. Tokens buffered in `window.__netBuffer` (max 50 entries, auto-eviction)
4. `provider-adapter.js` reads from buffer as primary source, falls back to DOM

### GLM SSE Format

```json
{ "type": "chat:completion", "data": { "delta_content": "...", "phase": "thinking|answer" } }
```

- `phase: "thinking"` → `reasoning_content` in OpenAI format
- `phase: "answer"` → `content` in OpenAI format

### Idempotent Installation

`hooks-auto-init.js` is the single entry point — safe to call multiple times:
- Checks if hooks already installed (guards on `window.__netHooksInstalled`)
- Installs network hooks (fetch/EventSource)
- Initializes debug trace
- Initializes provider adapters (if SSE classes loaded)

### Stats & Debug

```js
window.__netBuffer.stats()     // { total, parsed, errors, oldest }
window.__netBuffer.clear()     // clear buffer
```

---

## 🔌 Provider Adapter Architecture

**File:** `scripts/provider-adapter.js`

### IProviderAdapter Interface

Unified provider-agnostic API:

| Method | Description |
|--------|-------------|
| `observe()` | Full page state diagnostics |
| `send(text)` | Send message via human-like input |
| `read()` | Read response (adapter → network → DOM) |
| `healthCheck()` | Check all systems |

### GLMAdapter

Concrete adapter for GLM (chat.z.ai):
- Detects GLM-specific selectors (`.markdown-prose`, SVG buttons)
- Maps GLM phases to response state
- Handles Agent Mode tool call detection

### DOM-level `window.__adapter`

After initialization, the active adapter is mounted at `window.__adapter`:
- `window.__adapter.observe()` — full diagnostics
- `window.__adapter.read()` — read response
- `window.__adapter.healthCheck()` — health check
- `window.__adapter.send(text)` — send message

### Per-provider adapter: `window.__currentAdapter`

- `window.__currentAdapter.readFromBuffer()` — read from network buffer via adapter
- `window.__currentAdapter.getAnswerText()` — answer phase only
- `window.__currentAdapter.getThinkingText()` — thinking phase only

### OpenAINormalizer

Converts internal format to OpenAI-compatible output:

```js
new OpenAINormalizer().normalizeFull()        // full response in OpenAI SSE format
new OpenAINormalizer().toCompletionResponse() // full response as OpenAI JSON
```

### Multi-tier Locators (Fallback Chains)

If primary selector fails, fallback selectors are tried in order:

| Provider | Primary | Fallback 1 | Fallback 2 |
|----------|---------|------------|------------|
| GLM | `.markdown-prose` | `[class*="prose"]` | `[data-message-role="assistant"]` |
| Qwen | `[class*="message-content"]` | `.markdown-body` | `[role="article"]` |
| DeepSeek | `.ds-markdown` | `[class*="markdown"]` | `[role="article"]` |

Fallback activation triggers `console.warn` for observability.

---

## 🌉 OpenAI Bridge Architecture

**File:** `server/openai-bridge.js`

Express HTTP server that translates OpenAI API requests → Playwright browser automation → GLM/Qwen/DeepSeek chat → OpenAI format response.

### Flow

```
HTTP Request (OpenAI format)
  → Express router
    → Playwright page (navigate + type + send)
      → GLM chat generates response
        → Network hooks intercept SSE
          → Provider adapter reads from buffer
            → OpenAINormalizer converts to OpenAI format
              → HTTP Response (OpenAI format)
```

### CDP Auto-Discovery

On startup, scans `localhost:9222-9223` for existing Playwright/Chrome DevTools Protocol endpoints. If found, connects to the existing browser instead of launching a new one.

### Conversation Context Reuse

If the request URL matches the current page domain, the bridge reuses the existing conversation instead of re-navigating.

### Models

| Model ID | Provider | Notes |
|----------|----------|-------|
| `glm-5.1` | GLM | Latest |
| `glm-5` | GLM | |
| `glm-4` | GLM | |
| `qwen3` | Qwen | |
| `deepseek` | DeepSeek | Deep Think |
| `deepseek-chat` | DeepSeek | Standard |

### Function Calling Emulation

Tools are injected as a system prompt → model generates `<tool_call>` JSON blocks → `parseToolCalls()` extracts them:

```
tools → system prompt injection → parse <tool_call> JSON blocks from response
```

### Token Estimation

Char→token heuristic:
- English: 4 chars ≈ 1 token
- CJK: 1.5 chars ≈ 1 token

---

## 🔒 Session Management

**File:** `scripts/session-manager.js`

Persistent sessions via cookies/localStorage:

| Method | Description |
|--------|-------------|
| `window.__session.save()` | Save session → JSON (cookies + localStorage + sessionStorage) |
| `window.__session.restore(data)` | Restore session from JSON |
| `window.__session.status()` | Check authorization status |

- Session age validation: rejects sessions older than 7 days
- Bridge-level: `X-Session-Id` header, 30-min TTL, page reuse

---



## 🤖 AI-Extract Fallback Strategies

**File:** `scripts/ai-extract.js`

5-strategy cascade when primary methods fail:

| Priority | Strategy | Description |
|:--------:|----------|-------------|
| 1 | Network buffer | Check `window.__netBuffer` first |
| 2 | Selectors | Primary + fallback DOM selectors |
| 3 | Roles | `[data-message-role="assistant"]` or `[role="article"]` |
| 4 | Containers | Largest prose-like container |
| 5 | Longest prose | Last `.prose` / `.markdown` element by content length |

Each strategy logs its attempt and result for debugging.

---

## 🎯 Response Detection — Detailed

### Hierarchy (v14.0)

| Priority | Indicator | Reliability | Source | Notes |
|:--------:|-----------|:----------:|--------|-------|
| 🥇 0 | Network buffer (SSE tokens) | ⭐⭐⭐⭐⭐ | network-hooks.js | HTTP-level — DOM-independent |
| 🥈 1 | Copy / Regenerate buttons | ⭐⭐⭐⭐⭐ | DOM | Post-render — only after full completion |
| 🥉 2 | Stop disappears | ⭐⭐⭐⭐ | DOM | Reliable, but delay before Copy |
| 3 | Thinking disappears | ⭐⭐⭐ | DOM | Supplementary signal |
| 4 | innerText.length stable | ⭐⭐ | DOM | Fallback — false positives in Agent Mode |

### Per-provider Selectors

**⚠️ GLM buttons are SVG icons without text!** No `title`, no `aria-label`, no text. Identified by SVG path or position.

| Signal | GLM | Qwen | DeepSeek |
|--------|-----|------|----------|
| **Chat Input** | `#chat-input` | `textarea.message-input-textarea` | `textarea` |
| **Response text** | `.markdown-prose[last]` | `[class*="message-content"][last]` | `.ds-markdown[last]` |
| Generating | spinner `[class*="spinner"]` | `button:has-text("Stop")` | `button:has-text("Stop")` |
| Thinking | `[class*="thinking"]` | `"Generating..."` | `[class*="thinking"]` |
| Done | **2 SVG buttons** in `.markdown-prose` parent | `button:has-text("Copy")` | `button:has-text("Copy")` |
| Error | red toast/alert | text in message | red banner |

### Progress Model (5 Phases)

| Phase | Indicator | Polling | ETA |
|-------|-----------|---------|-----|
| WAITING_START (0-5s) | Stop not visible | every 2 sec | — |
| GENERATION_STARTED (5-15s) | Stop visible | every 5 sec | — |
| CONTENT_COMING (15s-?) | Stop visible + text growing | every 10 sec | depends on mode |
| THINKING | `[class*="thinking"]` visible | every 10 sec | Chat=5-30s, Agent=1-5min |
| AGENT_CALLING_TOOL | Stop gone, Copy missing | every 5 sec | 30-90s per tool |

### Timeouts by Mode

| Mode | Timeout | Typical |
|------|---------|---------|
| Chat | 60 sec | 5-15 sec |
| Web Search | 90 sec | 15-60 sec |
| Deep Think | 120 sec | 30-90 sec |
| Agent Mode | 300 sec (5 min) | 1-5 min |
| Agent + Deep Think | 480 sec (8 min) | 3-8 min |

---

## 🤖 GLM Agent Mode — Operational Details

**Tools:** web_search, code_execution, browser_automation, file_operations, mcp_servers
**Enable:** `.toolbar-icon.agent` → click (if not visible — already enabled)
⚠️ **beforeunload:** browser_automation may block Playwright. Solution: Copy/Regenerate detection.

### Agent Mode Hang Recovery

If no spinner, no Stop, no Copy, and textarea is locked → **open a new chat** (`chat.z.ai/`). Do NOT try to resuscitate.

### Between Tool Calls

Copy/Regenerate buttons flash between tool calls — **do NOT consider response complete**. Wait for 3 seconds of stable buttons.

---

## ❌ Error Recovery

| Situation | Action |
|-----------|--------|
| Stop not appeared in 15 sec | Check DOM errors, login redirect, retry 1× |
| Rate limit (429 / toast) | Wait 30 sec, retry 1× |
| Session expired (→ /login) | Notify user, DO NOT attempt login |
| Empty response | Retry 1×, if still empty → error |
| Partial response | Check `[class*="error"]` in DOM: if present → retry, else → return what's available + warning |
| **Agent Mode hung** | Open new chat, do NOT resuscitate |
| Copy/Regenerate flashed | Agent Mode — continue waiting |
| beforeunload dialog | Close tab, reopen |
| Redirect to /login | Warn user — needs auth |
| **Selector not found** | Startup Health-Check: verify all selectors → "Selector outdated for X" |
| **Anti-Bot / silent ban** | Use playwright-extra stealth; human-like typing (50-150ms) |
| **Context Overflow** | Extract history → summarize → new chat with summary |
| **One provider down** (multi) | Graceful degradation: continue with remaining, log error |
| **State Drift** | Before sending: verify textarea empty → if not → reload |

---

## 🛡️ Production Readiness

### Startup Health-Check

`response.js` + `provider-adapter.js` verify all selectors + network hooks + session manager on init.
If selector not found → "Selector outdated for Provider X"

```js
browser_evaluate('window.__adapter.healthCheck()')
```

### Anti-Bot Protection

- **playwright-extra** (fallback) — JS-level stealth patches
- **DO NOT** use `page.fill()` — use human-like typing (50-150ms delays)
- Random pauses between requests (2-5 sec)

### Resource Management

- 3 persistent contexts (one per provider) — do NOT create new per request
- `browserContext.close()` on MCP server stop
- RAM monitoring: if tab > 500MB → reload
- Network buffer capped at 50 entries (auto-eviction of oldest)

### Context Overflow Recovery

1. Parse UI error: "Message too long" / "History exceeded"
2. Extract full chat history (all `.markdown-prose`)
3. Summarize locally or via cheap API
4. Create new chat → send summary as system prompt
