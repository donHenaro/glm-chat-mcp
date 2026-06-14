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
  const { model = DEFAULT_MODEL, messages, stream = false } = req.body;

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
  const prompt = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);

  console.log(`[bridge] Request: model=${model}, prompt=${prompt.slice(0, 100)}...`);

  // Check cache (non-streaming only)
  if (!stream) {
    const hash = cacheHash(model, messages);
    const cached = cacheGet(hash);
    if (cached) {
      console.log(`[bridge] Cache hit: ${hash}`);
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
      if (!currentUrl.includes(new URL(provider.url).hostname)) {
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
        window.__netHooksInstalled = true;
      });

      // Send prompt
      await page.evaluate((text) => {
        const textarea = document.querySelector('#chat-input, textarea');
        if (!textarea) throw new Error('Textarea not found');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }, prompt);

      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const textarea = document.querySelector('#chat-input, textarea');
        if (textarea) textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      // Wait for response via network buffer
      const chatId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      if (stream) {
        // SSE streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // First chunk: role
        res.write(`data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);

        // Poll network buffer for new tokens
        let lastTokenCount = 0;
        let thinkingDone = false;

        while (Date.now() - startTime < TIMEOUT_MS) {
          await page.waitForTimeout(500);

          const state = await page.evaluate(() => {
            const latest = window.__netBuffer?.getLatest();
            const tokens = latest?.sseTokens || [];
            const complete = latest?.complete || false;
            return { tokens: tokens.map(t => ({ text: t.text, phase: t.phase })), complete, total: tokens.length };
          });

          // Send new tokens
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

          if (state.complete && state.total > 0) {
            // Final chunk
            res.write(`data: ${JSON.stringify({ id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            break;
          }
        }

        res.end();
      } else {
        // Non-streaming: wait for complete response
        let answerText = '';
        let thinkingText = '';

        while (Date.now() - startTime < TIMEOUT_MS) {
          await page.waitForTimeout(1000);

          const state = await page.evaluate(() => {
            const latest = window.__netBuffer?.getLatest();
            return {
              answer: window.__netBuffer?.getLatestTokens?.() || '',
              thinking: window.__netBuffer?.getLatestThinking?.() || '',
              complete: latest?.complete || false,
            };
          });

          answerText = state.answer;
          thinkingText = state.thinking;

          if (state.complete && answerText.length > 0) break;
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
              content: answerText,
              ...(thinkingText ? { reasoning_content: thinkingText } : {}),
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: answerText.length, total_tokens: answerText.length },
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

// === CDP Auto-Discovery ===
async function discoverCDP() {
  const http = require('http');
  const endpoints = [
    process.env.CDP_URL,
    'http://localhost:9222',
    'http://127.0.0.1:9222',
    'http://localhost:9223',
  ].filter(Boolean);
  for (const endpoint of endpoints) {
    try {
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
    } catch { /* next */ }
  }
  return null;
}

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
        const launchOpts = { headless: HEADLESS };
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
    contexts[key] = await browser.newContext();
    console.log(`[bridge] Context created for ${key}`);
  }

  return contexts[key];
}

// === Graceful shutdown ===
process.on('SIGINT', async () => {
  console.log('[bridge] Shutting down...');
  if (browser) await browser.close();
  process.exit(0);
});

// === Start ===
// === Status endpoint ===
app.get('/v1/status', (req, res) => {
  res.json({
    status: 'running',
    version: '14.3.0',
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
