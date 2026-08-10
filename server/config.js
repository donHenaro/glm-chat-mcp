/**
 * server/config.js
 * Shared configuration constants and CLOAK conditional import.
 */

// === CloakBrowser mode ===
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
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min session TTL

module.exports = {
  chromium,
  usingCloak,
  PORT,
  HEADLESS,
  PROVIDERS,
  DEFAULT_MODEL,
  TIMEOUT_MS,
  SESSION_TTL_MS,
};
