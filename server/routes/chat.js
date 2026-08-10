/**
 * server/routes/chat.js
 * POST /v1/chat/completions — main endpoint.
 */

const { chromium, usingCloak, HEADLESS, PROVIDERS, DEFAULT_MODEL, TIMEOUT_MS } = require('../config');
const state = require('../state');
const { cacheHash, cacheGet, cacheSet } = require('../services/cache');
const { createSessionId, cleanExpiredSessions, findAutoReuseSession, findSessionByProviderUrl } = require('../services/session');
const { estimateTokens, buildToolPrompt, parseToolCalls } = require('../services/helpers');
const { injectHooks, flushBuffer, sendPrompt } = require('../services/streaming');
const { getOrCreateContext } = require('../services/browser');
const { metrics } = require('../utils/metrics');
const { handleStreaming } = require('./stream.handler');
const { handleNonStreaming } = require('./nonstream.handler');
const { sendStreamFinalChunks } = require('./final.chunks');

const router = require('express').Router();

router.post('/v1/chat/completions', async (req, res) => {
  const { model = DEFAULT_MODEL, messages, stream = false, tools, tool_choice, stream_options } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request_error' } });
  }

  let provider = PROVIDERS[model];
  if (!provider) {
    return res.status(400).json({ error: { message: `Unknown model: ${model}. Available: ${Object.keys(PROVIDERS).join(', ')}`, type: 'invalid_request_error' } });
  }

  // Session continuity
  const sessionId = req.headers['x-session-id'] || null;
  let session = sessionId ? state.sessions[sessionId] : null;
  cleanExpiredSessions();

  // Extract last user message
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) {
    return res.status(400).json({ error: { message: 'No user message found', type: 'invalid_request_error' } });
  }
  let prompt = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);

  // Auto-reuse session
  if (!session) {
    const found = findAutoReuseSession(provider.url);
    if (found) {
      session = found.session;
      console.log(`[bridge] Auto-reusing session: ${found.sessionId} for ${provider.url}`);
    }
  }

  // URL-based routing
  if (!session) {
    for (const [modelId, prov] of Object.entries(PROVIDERS)) {
      const hostname = new URL(prov.url).hostname;
      if (prompt.includes(hostname) || prompt.includes(prov.url)) {
        const found = findSessionByProviderUrl(prov.url);
        if (found) {
          session = found.session;
          provider = prov;
          console.log(`[bridge] URL routing: matched ${hostname} → session ${found.sessionId}`);
          break;
        }
      }
    }
  }

  // Function calling emulation: inject tools into prompt
  let toolDefinitions = null;
  if (tools && tools.length > 0) {
    toolDefinitions = tools;
    prompt = buildToolPrompt(tools, prompt);
    console.log(`[bridge] Tools injected: ${tools.length} tools`);
  }

  console.log(`[bridge] Request: model=${model}, prompt=${prompt.slice(0, 100)}...`);
  metrics.requestsTotal++;
  metrics.requestsByModel[model] = (metrics.requestsByModel[model] || 0) + 1;
  const requestStart = Date.now();

  // Cache check (non-streaming)
  if (!stream) {
    const hash = cacheHash(model, messages);
    const cached = cacheGet(hash, state.responseCache);
    if (cached) {
      console.log(`[bridge] Cache hit: ${hash}`);
      metrics.cacheHits++;
      cached.cached = true;
      return res.json(cached);
    }
  }

  try {
    const context = await getOrCreateContext(provider, chromium, HEADLESS, usingCloak);

    // Reuse session page if available
    let page;
    let activeSessionId = null;
    if (session?.page && !session.page.isClosed()) {
      page = session.page;
      session.lastUsed = Date.now();
      activeSessionId = Object.entries(state.sessions).find(([, s]) => s === session)?.[0] || sessionId;
      console.log(`[bridge] Reusing session: ${activeSessionId}`);
      if (!res.headersSent && activeSessionId) res.setHeader('X-Session-Id', activeSessionId);
    } else {
      page = await context.newPage();
      activeSessionId = createSessionId();
      state.sessions[activeSessionId] = { page, provider, lastUsed: Date.now(), messages: [] };
      session = state.sessions[activeSessionId];
      if (!res.headersSent) res.setHeader('X-Session-Id', activeSessionId);
    }

    try {
      // Navigate to provider if needed
      const currentUrl = page.url();
      const providerHostname = new URL(provider.url).hostname;
      const needsNavigate = !currentUrl.includes(providerHostname);
      if (needsNavigate) {
        await page.goto(provider.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      }
      await page.waitForTimeout(2000);

      // Inject network hooks
      await injectHooks(page);

      // Flush buffer + track message
      await flushBuffer(page);
      if (session?.messages) session.messages.push({ role: 'user', content: prompt });

      // Send prompt
      await sendPrompt(page, prompt, provider.adapter);

      const chatId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      // Estimate prompt tokens
      const promptText = messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join(' ');
      const promptTokens = estimateTokens(promptText);
      const includeStreamUsage = req.body.stream_options?.include_usage === true;

      if (stream) {
        await handleStreaming(req, res, page, chatId, startTime, model, provider, toolDefinitions, promptTokens, includeStreamUsage, TIMEOUT_MS);
      } else {
        await handleNonStreaming(req, res, page, chatId, startTime, model, provider, messages, toolDefinitions, promptTokens);
      }
    } finally {
      if (!session) {
        setTimeout(() => page.close().catch(() => {}), 5000);
      }
    }
  } catch (error) {
    console.error('[bridge] Error:', error.message);
    metrics.errorsTotal++;

    // Auto-retry with fallback provider
    const RETRY_PROVIDERS = {
      'glm-5.1': 'deepseek', 'glm-5': 'deepseek', 'glm-4': 'deepseek',
      'qwen3': 'glm-5.1', 'deepseek': 'glm-5.1', 'deepseek-chat': 'glm-5.1',
    };
    const fallbackModel = RETRY_PROVIDERS[model];
    if (fallbackModel && !req._retried) {
      console.log(`[bridge] Retrying with fallback model: ${fallbackModel}`);
      metrics.fallbackRetries++;
      req._retried = true;
      req.body.model = fallbackModel;
      req.body._retried = true;
      return router.handle(req, res);
    }

    if (!res.headersSent) {
      res.status(500).json({ error: { message: error.message, type: 'server_error' } });
    } else {
      res.end();
    }
  }
});

module.exports = router;
