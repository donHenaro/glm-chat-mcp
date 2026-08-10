/**
 * server/routes/chat.js
 * POST /v1/chat/completions — main endpoint extracted from openai-bridge.js monolith.
 * Uses: services/browser.js, cache.js, session.js, helpers.js, streaming.js
 *       utils/metrics.js, config.js, state.js
 */

const { chromium, usingCloak, HEADLESS, PROVIDERS, DEFAULT_MODEL, TIMEOUT_MS } = require('../config');
const state = require('../state');
const { cacheHash, cacheGet, cacheSet } = require('../services/cache');
const { createSessionId, cleanExpiredSessions, findAutoReuseSession, findSessionByProviderUrl } = require('../services/session');
const { estimateTokens, buildToolPrompt, parseToolCalls } = require('../services/helpers');
const { injectHooks, flushBuffer, sendPrompt } = require('../services/streaming');
const { getOrCreateContext } = require('../services/browser');
const { metrics } = require('../utils/metrics');

const router = require('express').Router();
