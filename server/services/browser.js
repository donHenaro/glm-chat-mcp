/**
 * server/services/browser.js
 * Browser launch, CDP auto-discovery, and BrowserContext management.
 */

const state = require('../state');
const CDP_DEFAULT_PORT = 9222;

/**
 * Attempt to discover an existing Playwright browser via CDP endpoints.
 */
async function discoverCDP() {
  const http = require('http');
  const endpoints = [
    process.env.CDP_URL,
    `http://localhost:${CDP_DEFAULT_PORT}`,
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
    } catch { /* next endpoint */ }
  }
  return null;
}

/**
 * Launch or connect to a browser instance.
 * @param {object} chromium - Playwright/CloakBrowser chromium object
 * @param {boolean} headless
 * @param {boolean} usingCloak
 */
async function ensureBrowser(chromium, headless, usingCloak) {
  if (state.browser) return state.browser;

  // Step 1: CDP auto-discovery
  const cdp = await discoverCDP();
  if (cdp) {
    try {
      state.browser = await chromium.connectOverCDP(cdp.wsUrl);
      console.log(`[bridge] Connected via CDP: ${cdp.browser}`);
    } catch (e) {
      console.warn(`[bridge] CDP found but failed: ${e.message}`);
    }
  }

  // Step 2: Launch if no CDP
  if (!state.browser) {
    try {
      const launchOpts = {
        headless: headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      };
      if (usingCloak) {
        if (process.env.CLOAK_HUMANIZE !== 'false') launchOpts.humanize = true;
        if (process.env.CLOAK_GEOIP) launchOpts.geoip = process.env.CLOAK_GEOIP;
      }
      if (process.env.CLOAK_PROXY) launchOpts.proxy = { server: process.env.CLOAK_PROXY };
      state.browser = await chromium.launch(launchOpts);
      const mode = usingCloak ? 'CloakBrowser' : 'Playwright';
      console.log(`[bridge] ${mode} launched (headless=${headless})`);
    } catch (launchErr) {
      console.error(`[bridge] Failed to launch: ${launchErr.message}`);
      console.error(`[bridge] TIP: Set CDP_URL or run: npx playwright install chromium`);
      throw launchErr;
    }
  }

  return state.browser;
}

/**
 * Get or create a BrowserContext for the given provider.
 * @param {object} provider - { url, adapter }
 * @param {object} chromium - Playwright/CloakBrowser chromium object
 * @param {boolean} headless
 * @param {boolean} usingCloak
 */
async function getOrCreateContext(provider, chromium, headless, usingCloak) {
  if (!state.browser) {
    await ensureBrowser(chromium, headless, usingCloak);
  }

  const key = provider.url;
  if (!state.contexts[key]) {
    const allContexts = state.browser.contexts();
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
      state.contexts[key] = matched;
      console.log(`[bridge] Reusing matching browser context for ${key}`);
    } else if (allContexts.length > 0) {
      // No matching context — use first (shares cookies), new page will navigate
      state.contexts[key] = allContexts[0];
      console.log(`[bridge] Using shared context for ${key} (no matching page found)`);
    } else {
      state.contexts[key] = await state.browser.newContext();
      console.log(`[bridge] Context created for ${key}`);
    }
  }

  return state.contexts[key];
}

/**
 * Graceful shutdown: close the browser.
 */
async function shutdown() {
  if (state.browser) {
    await state.browser.close().catch(() => {});
  }
}

module.exports = {
  getOrCreateContext,
  shutdown,
};
