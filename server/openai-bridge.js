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
 *   node server/openai-bridge.js --port 8080
 *
 * Использование:
 *   curl http://localhost:8080/v1/chat/completions \
 *     -H "Content-Type: application/json" \
 *     -d '{"model":"glm-5.1","messages":[{"role":"user","content":"Hello"}],"stream":true}'
 *
 * Совместимость: Cline, Roo-Code, ChatBox, Open WebUI, anythingLLM
 */

const express = require('express');
const { chromium } = require('playwright');

// === Configuration ===
const PORT = parseInt(process.env.PORT || process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '8080', 10);
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

// === State ===
let browser = null;
let contexts = {}; // provider -> BrowserContext

const app = express();
app.use(express.json());

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

  // Extract the last user message
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) {
    return res.status(400).json({ error: { message: 'No user message found', type: 'invalid_request_error' } });
  }
  const prompt = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);

  console.log(`[bridge] Request: model=${model}, prompt=${prompt.slice(0, 100)}...`);

  try {
    // Get or create browser context for this provider
    const context = await getOrCreateContext(provider);
    const page = await context.newPage();

    try {
      // Navigate to provider
      await page.goto(provider.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
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

        res.json({
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
        });
      }
    } finally {
      await page.close();
    }
  } catch (error) {
    console.error('[bridge] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: error.message, type: 'server_error' } });
    } else {
      res.end();
    }
  }
});

// === Browser management ===
// === Browser management ===
async function getOrCreateContext(provider) {
  if (!browser) {
    // Try to connect to existing browser via CDP (from MCP Playwright)
    const cdpUrl = process.env.CDP_URL || 'http://localhost:9222';
    try {
      browser = await chromium.connectOverCDP(cdpUrl);
      console.log(`[bridge] Connected to existing browser via CDP: ${cdpUrl}`);
    } catch {
      // Fallback: launch new browser
      try {
        browser = await chromium.launch({ headless: HEADLESS });
        console.log(`[bridge] Browser launched (headless=${HEADLESS})`);
      } catch (launchErr) {
        console.error(`[bridge] Failed to launch browser: ${launchErr.message}`);
        console.error(`[bridge] TIP: Set CDP_URL env to connect to existing Playwright browser`);
        console.error(`[bridge] Or run: npx playwright install chromium`);
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
app.listen(PORT, () => {
  console.log(`[bridge] OpenAI-compatible API server running on http://localhost:${PORT}`);
  console.log(`[bridge] Models: ${Object.keys(PROVIDERS).join(', ')}`);
  console.log(`[bridge] Endpoints: GET /v1/models, POST /v1/chat/completions`);
});
