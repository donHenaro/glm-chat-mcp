/**
 * server/state.js
 * Shared mutable state for the OpenAI bridge.
 * All modules import from this single source of truth.
 */

module.exports = {
  browser: null,
  contexts: {},   // provider url -> BrowserContext
  sessions: {},   // sessionId -> { page, provider, lastUsed, messages }
  responseCache: {}, // hash -> { response, timestamp }
};
