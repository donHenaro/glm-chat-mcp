/**
 * server/openai-bridge.js v14.0
 * OpenAI-совместимый HTTP bridge — Express-сервер, транслирующий
 * запросы /v1/chat/completions через Playwright → браузер → провайдер.
 *
 * АРХИТЕКТУРА:
 * Client (Cline/ChatBox) → HTTP POST /v1/chat/completions
 *   → openai-bridge.js (Express)
 *     → Playwright: navigate to chat provider
 *     → Inject hooks-auto-init.js (network hooks)
 *     → Send prompt via textarea
 *     → Poll window.__netBuffer for SSE tokens
 *     → OpenAINormalizer: GLM SSE → OpenAI SSE
 *     → SSE response back to client
 *
 * Запуск:
 *   node server/openai-bridge.js --port=8102
 *
 * Использование:
 *   curl http://localhost:8102/v1/chat/completions \
 *     -H "Content-Type: application/json" \
 *     -d '{"model":"glm-5.1","messages":[{"role":"user","content":"Hello"}],"stream":true}'
 *
 * Совместимость: Cline, Roo-Code, ChatBox, Open WebUI, anythingLLM
 *
 * Порт по умолчанию: 8102 (безопасный диапазон 8100-8199)
 */

const express = require('express');

// === CloakBrowser mode ===
// If CLOAK=true, use cloakbrowser (stealth Playwright replacement) instead of playwright
// Pass CLOAK_HUMANIZE=true|false, CLOAK_PROXY=url, CLOAK_GEOIP=country
let chromium;
let usingCloak = false;
if (process.env.CLOAK === 'true') {
  try {
    chromium = require('cloakbrowser').chromium;
    usingCloak = true;
    console.log('[bridge] ✓ CloakBrowser mode enabled (stealth)');
  } catch {
    console.warn('[bridge] ⚠ CLOAK=true but cloakbrowser not installed, falling back to playwright');
    chromium = require('playwright').chromium;
  }
} else {
  chromium = require('playwright').chromium;
}

// === Configuration ===
const PORT = parseInt(process.env.PORT || process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '8102', 10);
const HEADLESS = process.env.HEADLESS !== 'false'; // default: headless
const PROVIDERS = {
  'glm-5.1':    { url: 'https://chat.z.ai',              adapter: 'glm' },
  'glm-5':      { url: 'https://chat.z.ai',              adapter: 'glm' },
  'glm-4':      { url: 'https://chat.z.ai',              adapter: 'glm' },
  'qwen3':      { url: 'https://chat.qwen.ai',           adapter: 'openai' },
  'deepseek':   { url: 'https://chat.deepseek.com',      adapter: 'openai' },
  'deepseek-chat': { url: 'https://chat.deepseek.com',   adapter: 'openai' },
  'kimi':       { url: 'https://kimi.com',                adapter: 'kimi' },
  'kimi-k2':    { url: 'https://kimi.com',                adapter: 'kimi' },
};
const DEFAULT_MODEL = 'glm-5.1';
const TIMEOUT_MS = 300000; // 5 minutes max
const CDP_DEFAULT_PORT = 9222;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min session TTL

// === State ===
let browser = null;
let contexts = {};   // provider -> BrowserContext
let sessions = {};   // sessionId -> { page, provider, lastUsed, messages }

// === Response Cache ===
const CACHE_ENABLED = process.env.CACHE !== 'false'; // default: enabled
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL || '300000', 10); // 5 min
const responseCache = {}; // hash -> { response, timestamp }

function cacheHash(model, messages) {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const key = `${model}:${lastUserMsg}`;
  // Simple hash (djb2)
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash) + key.charCodeAt(i);
  return hash.toString(36);
}

function cacheGet(hash) {
  if (!CACHE_ENABLED) return null;
  const entry = responseCache[hash];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { delete responseCache[hash]; return null; }
  return entry.response;
}

function cacheSet(hash, response) {
  if (!CACHE_ENABLED) return;
  responseCache[hash] = { response, timestamp: Date.now() };
  // Evict old entries if cache too large
  const keys = Object.keys(responseCache);
  if (keys.length > 100) {
    const oldest = keys.reduce((a, b) => responseCache[a].timestamp < responseCache[b].timestamp ? a : b);
    delete responseCache[oldest];
  }
}

const app = express();
app.use(express.json());

// === API Authentication ===
const API_KEYS = (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
const AUTH_ENABLED = API_KEYS.length > 0;

if (AUTH_ENABLED) {
  console.log(`[bridge] ✓ API auth enabled (${API_KEYS.length} keys)`);
  app.use('/v1', (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const queryKey = req.query?.key;
    const key = bearer || queryKey;
    if (!key || !API_KEYS.includes(key)) {
      return res.status(401).json({ error: { message: 'Invalid API key', type: 'authentication_error', code: 'invalid_api_key' } });
    }
    next();
  });
} else {
  console.log('[bridge] ⚠ API auth disabled (set API_KEYS env to enable)');
}

// === Rate Limiting ===
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10); // 1 min
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10); // 30 req/min
const rateLimitCounts = {}; // key -> {count, resetAt}

app.use('/v1/chat/completions', (req, res, next) => {
  if (!AUTH_ENABLED) return next(); // rate limit only with auth
  const key = (req.headers['authorization']?.slice(7)) || req.query?.key || 'anonymous';
  const now = Date.now();
  if (!rateLimitCounts[key] || now > rateLimitCounts[key].resetAt) {
    rateLimitCounts[key] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  }
  rateLimitCounts[key].count++;
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - rateLimitCounts[key].count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitCounts[key].resetAt / 1000));
  if (rateLimitCounts[key].count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error', code: 'rate_limit_exceeded' } });
  }
  next();
});

// === CDP Auto-Discovery ===
async function discoverCDP() {
  // Try common CDP endpoints to find existing Playwright browser
  const endpoints = [
    process.env.CDP_URL,
    `http://localhost:${CDP_DEFAULT_PORT}`,
    'http://127.0.0.1:9222',
    'http://localhost:9223',
  ].filter(Boolean);

  for (const endpoint of endpoints) {
    try {
      const http = require('http');
      const url = new URL('/json/version', endpoint);
      const version = await new Promise((resolve, reject) => {
        const req = http.get(url.toString(), { timeout: 2000 }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      });
      if (version.webSocketDebuggerUrl) {
        console.log(`[bridge] Found CDP at ${endpoint}: ${version.Browser}`);
        return { endpoint, wsUrl: version.webSocketDebuggerUrl, browser: version.Browser };
      }
    } catch { /* next endpoint */ }
  }
  return null;
}

// === Session Management ===
function createSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, sess] of Object.entries(sessions)) {
    if (now - sess.lastUsed > SESSION_TTL_MS) {
      console.log(`[bridge] Session expired: ${id}`);
      sess.page?.close?.().catch(() => {});
      delete sessions[id];
    }
  }
}

// === Health check ===
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(PROVIDERS).map(id => ({
      id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'glm-chat-mcp',
    })),
  });
});

// === Main endpoint ===
app.post('/v1/chat/completions', async (req, res) => {
  const { model = DEFAULT_MODEL, messages, stream = false, tools, tool_choice, stream_options } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request_error' } });
  }

  const provider = PROVIDERS[model];
  if (!provider) {
    return res.status(400).json({ error: { message: `Unknown model: ${model}. Available: ${Object.keys(PROVIDERS).join(', ')}`, type: 'invalid_request_error' } });
  }

  // Session continuity: check if client sent session_id header
  const sessionId = req.headers['x-session-id'] || null;
  let session = sessionId ? sessions[sessionId] : null;

  // Clean expired sessions
  cleanExpiredSessions();

  // Extract the last user message
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) {
    return res.status(400).json({ error: { message: 'No user message found', type: 'invalid_request_error' } });
  }
  let prompt = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);

  // === Function Calling Emulation ===
  // If client sends tools, inject them as prompt instructions
  // so the model knows about available tools and can output structured JSON
  let toolDefinitions = null;
  if (tools && tools.length > 0) {
    toolDefinitions = tools;
    const toolInstructions = tools.map(t => {
      const func = t.function;
      const params = func.parameters?.properties ? JSON.stringify(func.parameters) : 'none';
      return `- ${func.name}: ${func.description || 'No description'}. Parameters: ${params}`;
    }).join('\n');

    const toolSystemMsg = `[TOOL INSTRUCTIONS]
You have access to the following tools. When you need to call a tool, respond with a JSON block in this exact format:
\`\`\`json
{"tool_calls": [{"name": "function_name", "arguments": {"param1": "value1"}}]}
\`\`\`

Available tools:
${toolInstructions}

Important: Only use tool calls when the task requires it. For normal questions, respond with regular text.
[/TOOL INSTRUCTIONS]

`;
    prompt = toolSystemMsg + prompt;
    console.log(`[bridge] Tools injected: ${tools.length} tools`);
  }

  console.log(`[bridge] Request: model=${model}, prompt=${prompt.slice(0, 100)}...`);
  metrics.requestsTotal++;
  metrics.requestsByModel[model] = (metrics.requestsByModel[model] || 0) + 1;
  const requestStart = Date.now();

  // Check cache (non-streaming only)
  if (!stream) {
    const hash = cacheHash(model, messages);
    const cached = cacheGet(hash);
    if (cached) {
      console.log(`[bridge] Cache hit: ${hash}`);
      metrics.cacheHits++;
      cached.cached = true;
      return res.json(cached);
    }
  }

  try {
    // Get or create browser context for this provider
    const context = await getOrCreateContext(provider);

    // Reuse session page if available
    let page;
    if (session?.page && !session.page.isClosed()) {
      page = session.page;
      session.lastUsed = Date.now();
      console.log(`[bridge] Reusing session: ${sessionId}`);
    } else {
      page = await context.newPage();
      const newSessionId = sessionId || createSessionId();
      sessions[newSessionId] = { page, provider, lastUsed: Date.now(), messages: [] };
      if (!res.headersSent) res.setHeader('X-Session-Id', newSessionId);
    }

    try {
      // Navigate to provider (only if new page or not on chat URL)
      const currentUrl = page.url();
      const needsNavigate = !currentUrl.includes(new URL(provider.url).hostname);
      if (needsNavigate) {
        await page.goto(provider.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      }
      await page.waitForTimeout(2000);

      // Inject network hooks
      await page.evaluate(() => {
        if (window.__netHooksInstalled) return;
        if (!window.__origFetch) window.__origFetch = window.fetch;
        const patterns = ['/api/v2/chat/completions', '/api/chat/', '/completions'];
        function parseSSE(text) {
          const tokens = [];
          for (const line of text.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim();
            if (d === '[DONE]') break;
            try { const j = JSON.parse(d); const gc = j?.data?.delta_content; if (gc) { tokens.push({text:gc,phase:j?.data?.phase||'answer'}); continue; } const oc = j?.choices?.[0]?.delta?.content||''; if (oc) tokens.push({text:oc,phase:'answer'}); } catch {}
          }
          return tokens;
        }
        window.__netBuffer = { entries:[], _max:50, add(e){this.entries.push(e);if(this.entries.length>this._max)this.entries.shift();}, getLatest(){const ce=this.entries.filter(e=>patterns.some(p=>e.url.includes(p)));const entry=ce[ce.length-1]||null;if(entry&&(!entry.sseTokens||entry.sseTokens.length===0)&&entry.body)entry.sseTokens=parseSSE(entry.body);return entry;}, getLatestTokens(){const l=this.getLatest();if(!l?.sseTokens?.length)return null;return l.sseTokens.filter(t=>t.phase!=='thinking').map(t=>typeof t==='string'?t:t.text).join('');}, flush(){this.entries=[];}, stats(){return{totalEntries:this.entries.length};} };
        const origFetch = window.__origFetch;
        window.fetch = async function(...args) {
          const url = typeof args[0]==='string'?args[0]:args[0]?.url||'';
          const response = await origFetch.apply(this, args);
          if (patterns.some(p=>url.includes(p))) {
            try { const [s1,s2]=response.body.tee(); const reader=s2.getReader(); const decoder=new TextDecoder(); let tokens=[],body=''; (async()=>{ try{let buf='';while(true){const{done,value}=await reader.read();if(done)break;const chunk=decoder.decode(value,{stream:true});body+=chunk;buf+=chunk;const lines=buf.split('\n');buf=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const d=line.slice(5).trim();if(d==='[DONE]')break;try{const j=JSON.parse(d);const gc=j?.data?.delta_content;if(gc){tokens.push({text:gc,phase:j?.data?.phase||'answer'});continue;}const oc=j?.choices?.[0]?.delta?.content||'';if(oc)tokens.push({text:oc,phase:'answer'});}catch{}}} window.__netBuffer.add({url,status:response.status,body:body.slice(0,10000),sseTokens:tokens,timestamp:Date.now(),method:'fetch-stream',complete:true}); }catch(e){} })();
            return new Response(s1,{status:response.status,statusText:response.statusText,headers:response.headers});
            } catch { const cloned=response.clone(); cloned.text().then(b=>{const t=parseSSE(b);window.__netBuffer.add({url,status:response.status,body:b.slice(0,10000),sseTokens:t,timestamp:Date.now(),method:'fetch-clone',complete:true});}).catch(()=>{}); return response; }
          }
          return response;
        };
        // Also intercept EventSource (used by some providers like DeepSeek)
        if (!window.__origEventSource) window.__origEventSource = window.EventSource;
        window.EventSource = function(url, opts) {
          const es = new window.__origEventSource(url, opts);
          if (patterns.some(p => url.includes(p))) {
            let tokens = [];
            es.addEventListener('message', (e) => {
              const d = e.data;
              if (d === '[DONE]') {
                window.__netBuffer.add({url, body:'', sseTokens:tokens, timestamp:Date.now(), method:'eventsource', complete:true});
                return;
              }
              try {
                const j = JSON.parse(d);
                const gc = j?.data?.delta_content;
                if (gc) { tokens.push({text:gc, phase:j?.data?.phase||'answer'}); return; }
                const oc = j?.choices?.[0]?.delta?.content || '';
                if (oc) tokens.push({text:oc, phase:'answer'});
              } catch {}
            });
          }
          return es;
        };
        window.__netHooksInstalled = true;
      });

      // Send prompt (textarea for most providers, contenteditable for Kimi)
      const providerAdapter = provider.adapter;
      await page.evaluate(({ text, adapter }) => {
        if (adapter === 'kimi') {
          // Kimi uses contenteditable div
          const editor = document.querySelector('.chat-input-editor, [contenteditable="true"]');
          if (!editor) throw new Error('Contenteditable input not found');
          editor.focus();
          document.execCommand('insertText', false, text);
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const textarea = document.querySelector('#chat-input, textarea');
          if (!textarea) throw new Error('Textarea not found');
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(textarea, text);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { text: prompt, adapter: providerAdapter });

      await page.waitForTimeout(300);
      await page.evaluate((adapter) => {
        if (adapter === 'kimi') {
          const editor = document.querySelector('.chat-input-editor, [contenteditable="true"]');
          if (editor) {
            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
        } else {
          const textarea = document.querySelector('#chat-input, textarea');
          if (textarea) textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
      }, providerAdapter);

      // Wait for response via network buffer
      const chatId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      // Token counting helper (approximate: ~4 chars per token for English, ~2 for CJK)
      function estimateTokens(text) {
        if (!text) return 0;
        // Rough approximation: count CJK chars as 1 token each, others as ~4 chars/token
        const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
        const otherChars = text.length - cjkChars;
        return Math.ceil(cjkChars + otherChars / 4);
      }

      // Estimate prompt tokens from messages
      const promptText = messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join(' ');
      const promptTokens = estimateTokens(promptText);

      // Check if client wants usage in stream (OpenAI stream_options)
      const includeStreamUsage = req.body.stream_options?.include_usage === true;

      if (stream) {
        // SSE streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // First chunk: role
        const firstChunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] };
        res.write(`data: ${JSON.stringify(firstChunk)}\n\n`);

        // Poll network buffer for new tokens (or DOM for gRPC providers)
        const useDomFallback = providerAdapter === 'kimi' || provider.url.includes('deepseek.com');
        let lastTokenCount = 0;
        let thinkingDone = false;
        let lastDomText = '';

        while (Date.now() - startTime < TIMEOUT_MS) {
          await page.waitForTimeout(500);

          const state = await page.evaluate((domFallback) => {
            if (domFallback) {
              // DOM fallback for gRPC providers (kimi)
              const mdBlocks = document.querySelectorAll('[class*="markdown"], [class*="message-content"], .agent-chat-item');
              const lastBlock = mdBlocks[mdBlocks.length - 1];
              const text = lastBlock ? lastBlock.innerText.trim() : '';
              const isLoading = !!document.querySelector('[class*="loading"], [class*="typing"]');
              return { tokens: text ? [{ text, phase: 'answer' }] : [], complete: text.length > 0 && !isLoading, total: text ? 1 : 0, domText: text };
            }
            const latest = window.__netBuffer?.getLatest();
            const tokens = latest?.sseTokens || [];
            const complete = latest?.complete || false;
            return { tokens: tokens.map(t => ({ text: t.text, phase: t.phase })), complete, total: tokens.length, domText: '' };
          }, useDomFallback);

          // Send new tokens
          if (useDomFallback && state.domText) {
            // DOM fallback: send only the diff (new characters since last poll)
            if (state.domText.length > lastDomText.length) {
              const newChars = state.domText.slice(lastDomText.length);
              lastDomText = state.domText;
              res.write(`data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { content: newChars }, finish_reason: null }] })}\n\n`);
            }
          } else {
            for (let i = lastTokenCount; i < state.total; i++) {
              const token = state.tokens[i];
              if (!token) continue;

              const delta = {};
              if (token.phase === 'thinking') {
                delta.reasoning_content = token.text;
              } else {
                delta.content = token.text;
              }

              res.write(`data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
            }
            lastTokenCount = state.total;
          }

          if (state.complete && state.total > 0) {
            // Collect all answer/thinking tokens for token counting and tool_calls parsing
            const allTokens = await page.evaluate(() => {
              const latest = window.__netBuffer?.getLatest();
              const tokens = latest?.sseTokens || [];
              const answer = tokens.filter(t => t.phase === 'answer').map(t => t.text || '').join('');
              const thinking = tokens.filter(t => t.phase === 'thinking').map(t => t.text || '').join('');
              return { answer, thinking };
            });
            const completionTokens = estimateTokens(allTokens.answer + allTokens.thinking);

            // Check for tool_calls in streaming response
            let streamFinishReason = 'stop';
            if (toolDefinitions && allTokens.answer) {
              const toolCallRegex = /```json\s*([\s\S]*?)```/;
              const match = allTokens.answer.match(toolCallRegex);
              if (match) {
                try {
                  const parsed = JSON.parse(match[1]);
                  if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                    streamFinishReason = 'tool_calls';
                    // Emit tool_calls chunks in streaming format
                    for (let i = 0; i < parsed.tool_calls.length; i++) {
                      const tc = parsed.tool_calls[i];
                      const toolChunk = {
                        id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model,
                        choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `call_${Date.now()}_${i}`, type: 'function', function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) } }] }, finish_reason: null }]
                      };
                      res.write(`data: ${JSON.stringify(toolChunk)}\n\n`);
                    }
                    console.log(`[bridge] Streamed ${parsed.tool_calls.length} tool_calls`);
                  }
                } catch { /* not tool_calls JSON */ }
              }
            }

            // Final chunk with finish_reason
            const finalChunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: {}, finish_reason: streamFinishReason }] };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);

            // Usage chunk (if requested via stream_options.include_usage)
            if (includeStreamUsage) {
              const usageChunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } };
              res.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
            }

            res.write('data: [DONE]\n\n');
            break;
          }
        }

        res.end();
      } else {
        // Non-streaming: wait for complete response
        // For gRPC providers (kimi), SSE hooks won't fire — use DOM fallback
        const useDomFallback = providerAdapter === 'kimi' || provider.url.includes('deepseek.com');
        let answerText = '';
        let thinkingText = '';

        while (Date.now() - startTime < TIMEOUT_MS) {
          await page.waitForTimeout(1000);

          const state = await page.evaluate((domFallback) => {
            const latest = window.__netBuffer?.getLatest();
            const netAnswer = window.__netBuffer?.getLatestTokens?.() || '';
            const netThinking = window.__netBuffer?.getLatestThinking?.() || '';

            if (domFallback && !netAnswer) {
              // DOM fallback: only when SSE hooks didn't capture anything (gRPC or CDP issues)
              const mdBlocks = document.querySelectorAll('[class*="markdown"], [class*="message-content"], .agent-chat-item, .ds-markdown');
              const lastBlock = mdBlocks[mdBlocks.length - 1];
              const domAnswer = lastBlock ? lastBlock.innerText.trim() : '';
              const isLoading = !!document.querySelector('[class*="loading"], [class*="typing"], .ds-loading');
              return {
                answer: domAnswer,
                thinking: netThinking,
                complete: domAnswer.length > 0 && !isLoading,
              };
            }


            return {
              answer: netAnswer,
              thinking: netThinking,
              complete: latest?.complete || false,
            };
          }, useDomFallback);

          answerText = state.answer;
          thinkingText = state.thinking;

          if (state.complete && answerText.length > 0) break;
        }

        // === Parse tool_calls from response (Function Calling Emulation) ===
        let parsedToolCalls = null;
        let contentText = answerText;
        let finishReason = 'stop';

        if (toolDefinitions) {
          // Try to extract tool_calls JSON from the response
          const toolCallRegex = /```json\s*([\s\S]*?)```/;
          const match = answerText.match(toolCallRegex);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                parsedToolCalls = parsed.tool_calls.map((tc, idx) => ({
                  id: `call_${Date.now()}_${idx}`,
                  type: 'function',
                  function: {
                    name: tc.name,
                    arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
                  }
                }));
                finishReason = 'tool_calls';
                contentText = null; // OpenAI sets content to null when tool_calls present
                console.log(`[bridge] Parsed ${parsedToolCalls.length} tool_calls from response`);
              }
            } catch (e) {
              console.warn('[bridge] Failed to parse tool_calls JSON:', e.message);
            }
          }

          // Also try raw JSON without markdown fences
          if (!parsedToolCalls) {
            try {
              const parsed = JSON.parse(answerText);
              if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                parsedToolCalls = parsed.tool_calls.map((tc, idx) => ({
                  id: `call_${Date.now()}_${idx}`,
                  type: 'function',
                  function: {
                    name: tc.name,
                    arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
                  }
                }));
                finishReason = 'tool_calls';
                contentText = null;
                console.log(`[bridge] Parsed ${parsedToolCalls.length} tool_calls from raw JSON`);
              }
            } catch { /* not JSON, that's fine */ }
          }
        }

        const response = {
          id: chatId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: contentText,
              ...(thinkingText ? { reasoning_content: thinkingText } : {}),
              ...(parsedToolCalls ? { tool_calls: parsedToolCalls } : {}),
            },
            finish_reason: finishReason,
          }],
          usage: { prompt_tokens: promptTokens, completion_tokens: estimateTokens(answerText + thinkingText), total_tokens: promptTokens + estimateTokens(answerText + thinkingText) },
        };

        // Cache the response
        cacheSet(cacheHash(model, messages), response);

        res.json(response);
      }
    } finally {
      // Don't close page if session exists (reuse for conversation)
      if (!session) {
        // No session — close page after use
        // But keep it alive for a few seconds in case client sends follow-up
        setTimeout(() => page.close().catch(() => {}), 5000);
      }
    }
  } catch (error) {
    console.error('[bridge] Error:', error.message);
    metrics.errorsTotal++;

    // Auto-Retry: try fallback provider if available
    const RETRY_PROVIDERS = {
      'glm-5.1': 'deepseek',
      'glm-5': 'deepseek',
      'glm-4': 'deepseek',
      'qwen3': 'glm-5.1',
      'deepseek': 'glm-5.1',
      'deepseek-chat': 'glm-5.1',
    };
    const fallbackModel = RETRY_PROVIDERS[model];
    if (fallbackModel && !req._retried) {
      console.log(`[bridge] Retrying with fallback model: ${fallbackModel}`);
      metrics.fallbackRetries++;
      req._retried = true;
      req.body.model = fallbackModel;
      req.body._retried = true;
      return app.handle(req, res); // retry internally
    }

    if (!res.headersSent) {
      res.status(500).json({ error: { message: error.message, type: 'server_error' } });
    } else {
      res.end();
    }
  }
});

// === Browser management ===
async function getOrCreateContext(provider) {
  if (!browser) {
    // Step 1: CDP auto-discovery
    const cdp = await discoverCDP();
    if (cdp) {
      try {
        browser = await chromium.connectOverCDP(cdp.wsUrl);
        console.log(`[bridge] Connected via CDP: ${cdp.browser}`);
      } catch (e) {
        console.warn(`[bridge] CDP found but failed: ${e.message}`);
      }
    }
    // Step 2: Launch if no CDP
    if (!browser) {
      try {
        const launchOpts = {
          headless: HEADLESS,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        };
        if (usingCloak) {
          if (process.env.CLOAK_HUMANIZE !== 'false') launchOpts.humanize = true;
          if (process.env.CLOAK_GEOIP) launchOpts.geoip = process.env.CLOAK_GEOIP;
        }
        if (process.env.CLOAK_PROXY) launchOpts.proxy = { server: process.env.CLOAK_PROXY };
        browser = await chromium.launch(launchOpts);
        const mode = usingCloak ? 'CloakBrowser' : 'Playwright';
        console.log(`[bridge] ${mode} launched (headless=${HEADLESS})`);
      } catch (launchErr) {
        console.error(`[bridge] Failed to launch: ${launchErr.message}`);
        console.error(`[bridge] TIP: Set CDP_URL or run: npx playwright install chromium`);
        throw launchErr;
      }
    }
  }

  const key = provider.url;
  if (!contexts[key]) {
    const allContexts = browser.contexts();
    // CDP mode: find context with a page matching this provider's hostname
    let matched = null;
    for (const ctx of allContexts) {
      for (const pg of ctx.pages()) {
        try {
          if (pg.url().includes(new URL(provider.url).hostname)) {
            matched = ctx;
            break;
          }
        } catch {}
      }
      if (matched) break;
    }
    if (matched) {
      contexts[key] = matched;
      console.log(`[bridge] Reusing matching browser context for ${key}`);
    } else if (allContexts.length > 0) {
      // No matching context — use first (shares cookies), new page will navigate
      contexts[key] = allContexts[0];
      console.log(`[bridge] Using shared context for ${key} (no matching page found)`);
    } else {
      contexts[key] = await browser.newContext();
      console.log(`[bridge] Context created for ${key}`);
    }
  }

  return contexts[key];
}

// === Graceful shutdown ===
process.on('SIGINT', async () => {
  console.log('[bridge] Shutting down...');
  if (browser) await browser.close();
  process.exit(0);
});

// === Metrics (Prometheus) ===
const metrics = {
  requestsTotal: 0,
  requestsByModel: {},
  errorsTotal: 0,
  cacheHits: 0,
  cacheMisses: 0,
  fallbackRetries: 0,
  responseTimeSum: 0,
  responseTimeCount: 0,
  activeContexts: 0,
};

app.get('/metrics', (req, res) => {
  const m = metrics;
  const mem = process.memoryUsage();
  res.set('Content-Type', 'text/plain');
  res.send(`
# HELP glm_chat_requests_total Total number of chat completion requests
# TYPE glm_chat_requests_total counter
glm_chat_requests_total ${m.requestsTotal}

# HELP glm_chat_errors_total Total number of errors
# TYPE glm_chat_errors_total counter
glm_chat_errors_total ${m.errorsTotal}

# HELP glm_chat_cache_hits_total Cache hit count
# TYPE glm_chat_cache_hits_total counter
glm_chat_cache_hits_total ${m.cacheHits}

# HELP glm_chat_cache_misses_total Cache miss count
# TYPE glm_chat_cache_misses_total counter
glm_chat_cache_misses_total ${m.cacheMisses}

# HELP glm_chat_fallback_retries_total Fallback retry count
# TYPE glm_chat_fallback_retries_total counter
glm_chat_fallback_retries_total ${m.fallbackRetries}

# HELP glm_chat_response_time_ms Average response time in ms
# TYPE glm_chat_response_time_ms gauge
glm_chat_response_time_ms ${m.responseTimeCount > 0 ? Math.round(m.responseTimeSum / m.responseTimeCount) : 0}

# HELP glm_chat_active_sessions Active sessions
# TYPE glm_chat_active_sessions gauge
glm_chat_active_sessions ${Object.keys(sessions).length}

# HELP glm_chat_active_contexts Active browser contexts
# TYPE glm_chat_active_contexts gauge
glm_chat_active_contexts ${Object.keys(contexts).length}

# HELP glm_chat_memory_rss_bytes Process RSS memory in bytes
# TYPE glm_chat_memory_rss_bytes gauge
glm_chat_memory_rss_bytes ${mem.rss}

# HELP glm_chat_memory_heap_used_bytes Heap used in bytes
# TYPE glm_chat_memory_heap_used_bytes gauge
glm_chat_memory_heap_used_bytes ${mem.heapUsed}

# HELP glm_chat_uptime_seconds Process uptime in seconds
# TYPE glm_chat_uptime_seconds gauge
glm_chat_uptime_seconds ${process.uptime()}
`.trim());
});

// === Status endpoint ===
app.get('/v1/status', (req, res) => {
  res.json({
    status: 'running',
    version: '14.4.0',
    browser: browser ? 'connected' : 'not started',
    cloak: usingCloak,
    activeSessions: Object.keys(sessions).length,
    models: Object.keys(PROVIDERS),
    uptime: process.uptime(),
  });
});

// === Sessions endpoint ===
app.get('/v1/sessions', (req, res) => {
  const list = Object.entries(sessions).map(([id, s]) => ({
    id,
    provider: s.provider?.url,
    age: Math.round((Date.now() - s.lastUsed) / 1000) + 's ago',
    messages: s.messages?.length || 0,
  }));
  res.json({ sessions: list });
});

app.listen(PORT, () => {
  console.log(`[bridge] OpenAI-compatible API server running on http://localhost:${PORT}`);
  console.log(`[bridge] Models: ${Object.keys(PROVIDERS).join(', ')}`);
  console.log(`[bridge] Endpoints: GET /v1/models, GET /v1/status, GET /v1/sessions, POST /v1/chat/completions`);
  console.log(`[bridge] CloakBrowser: ${usingCloak ? 'ON' : 'OFF'} | Headless: ${HEADLESS}`);
});
