/**
 * server/services/session.js
 * Session CRUD, expiry cleanup, and status reporting.
 */

const state = require('../state');
const { SESSION_TTL_MS } = require('../config');

/**
 * Create a unique session ID.
 */
function createSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Remove expired sessions and close their pages.
 */
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, sess] of Object.entries(state.sessions)) {
    if (now - sess.lastUsed > SESSION_TTL_MS) {
      console.log(`[bridge] Session expired: ${id}`);
      sess.page?.close?.().catch(() => {});
      delete state.sessions[id];
    }
  }
}

/**
 * Find the most recently used session for a given provider URL.
 */
function findAutoReuseSession(providerUrl) {
  const providerSessions = Object.entries(state.sessions)
    .filter(([, s]) => s.provider?.url === providerUrl && s.page && !s.page.isClosed())
    .sort((a, b) => b[1].lastUsed - a[1].lastUsed);
  if (providerSessions.length > 0) {
    return { session: providerSessions[0][1], sessionId: providerSessions[0][0] };
  }
  return null;
}

/**
 * Find the most recently used session matching a provider URL (for URL routing).
 */
function findSessionByProviderUrl(providerUrl) {
  const urlSessions = Object.entries(state.sessions)
    .filter(([, s]) => s.provider?.url === providerUrl && s.page && !s.page.isClosed())
    .sort((a, b) => b[1].lastUsed - a[1].lastUsed);
  if (urlSessions.length > 0) {
    return { session: urlSessions[0][1], sessionId: urlSessions[0][0] };
  }
  return null;
}

/**
 * Get session by ID.
 */
function getSession(id) {
  return state.sessions[id] || null;
}

/**
 * List all sessions with metadata.
 */
function listSessions(PROVIDERS) {
  return Object.entries(state.sessions).map(([id, s]) => ({
    id,
    provider: s.provider?.url,
    model: Object.entries(PROVIDERS).find(([, p]) => p.url === s.provider?.url)?.[0] || 'unknown',
    age: Math.round((Date.now() - s.lastUsed) / 1000) + 's ago',
    messages: s.messages?.length || 0,
    history: s.messages || [],
  }));
}

/**
 * Extract chat history from a session's page DOM.
 */
async function extractPageHistory(page) {
  return await page.evaluate(() => {
    const messages = [];
    const hostname = location.hostname;

    if (hostname.includes('z.ai') || hostname.includes('chatglm')) {
      const items = document.querySelectorAll('.message-item');
      items.forEach((el, i) => {
        const isUser = !!el.querySelector('.user, [class*="user"], [class*="self"]') || el.className.includes('user');
        const contentEl = el.querySelector('.markdown, [class*="markdown"], [class*="content"]') || el;
        const text = contentEl.innerText?.trim();
        if (text) messages.push({ index: i, role: isUser ? 'user' : 'assistant', content: text.slice(0, 3000) });
      });
    } else if (hostname.includes('deepseek')) {
      const items = document.querySelectorAll('.ds-chat-message, [class*="chat-message"]');
      items.forEach((el, i) => {
        const isUser = el.className.includes('user') || !!el.querySelector('[class*="user"]');
        const text = el.innerText?.trim();
        if (text) messages.push({ index: i, role: isUser ? 'user' : 'assistant', content: text.slice(0, 3000) });
      });
    } else if (hostname.includes('qwen')) {
      const items = document.querySelectorAll('[class*="dialogue-item"], [class*="chat-row"]');
      items.forEach((el, i) => {
        const isUser = el.className.includes('user') || !!el.querySelector('[class*="user"]');
        const text = el.innerText?.trim();
        if (text) messages.push({ index: i, role: isUser ? 'user' : 'assistant', content: text.slice(0, 3000) });
      });
    } else if (hostname.includes('kimi')) {
      const items = document.querySelectorAll('.agent-chat-item, [class*="chatItem"]');
      items.forEach((el, i) => {
        const isUser = el.className.includes('user') || !!el.querySelector('[class*="user"]');
        const text = el.innerText?.trim();
        if (text) messages.push({ index: i, role: isUser ? 'user' : 'assistant', content: text.slice(0, 3000) });
      });
    }

    if (messages.length === 0) {
      const blocks = document.querySelectorAll('[class*="markdown"], [role="article"]');
      blocks.forEach((el, i) => {
        const text = el.innerText?.trim();
        if (text) messages.push({ index: i, role: 'assistant', content: text.slice(0, 3000) });
      });
    }

    return messages;
  });
}

module.exports = {
  createSessionId,
  cleanExpiredSessions,
  findAutoReuseSession,
  findSessionByProviderUrl,
  getSession,
  listSessions,
  extractPageHistory,
};
