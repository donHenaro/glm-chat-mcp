#!/usr/bin/env node
/**
 * server/cloak-browser-mcp.js
 * Custom Playwright MCP server using CloakBrowser for stealth browser automation.
 * Drop-in replacement for @anthropic-ai/mcp-server-playwright.
 *
 * Usage:
 *   node server/cloak-browser-mcp.js
 *
 * Environment variables:
 *   CLOAK_HUMANIZE   - Enable human-like behavior (default: "true")
 *   CLOAK_PROXY      - Proxy server URL (e.g. "http://user:pass@host:port")
 *   CLOAK_GEOIP      - GeoIP country code (e.g. "US")
 *   HEADLESS         - Run headless (default: "true")
 *
 * MCP Protocol: JSON-RPC 2.0 over stdio
 */

'use strict';

const readline = require('readline');

// ── CloakBrowser / Playwright resolution ──────────────────────────────────────
let pw;
let usingCloak = false;

try {
  pw = require('cloakbrowser');
  usingCloak = true;
  console.error('[cloak-mcp] ✓ CloakBrowser loaded (stealth mode)');
} catch {
  try {
    pw = require('playwright');
    console.error('[cloak-mcp] ⚠ cloakbrowser not installed, falling back to standard playwright');
    console.error('[cloak-mcp]   Install cloakbrowser for stealth: npm install cloakbrowser');
  } catch {
    console.error('[cloak-mcp] ✗ Neither cloakbrowser nor playwright found. Install one:');
    console.error('[cloak-mcp]   npm install cloakbrowser   # recommended (stealth)');
    console.error('[cloak-mcp]   npm install playwright     # fallback');
    process.exit(1);
  }
}

const { chromium } = pw;

// ── Configuration ─────────────────────────────────────────────────────────────
const HUMANIZE = process.env.CLOAK_HUMANIZE !== 'false'; // default true
const PROXY_URL = process.env.CLOAK_PROXY || null;
const GEOIP = process.env.CLOAK_GEOIP || null;
const HEADLESS = process.env.HEADLESS !== 'false'; // default true

// ── State ─────────────────────────────────────────────────────────────────────
let browser = null;
let page = null;
let requestIdCounter = 0;

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page using a CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to click' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an element identified by CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the input element' },
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Evaluate JavaScript expression in the browser page context',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JavaScript expression to evaluate' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'browser_snapshot',
    description: 'Capture a snapshot of the current page (accessibility tree or HTML summary)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key (e.g. Enter, Tab, Escape)',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press (e.g. Enter, Tab, Escape, ArrowDown)' },
      },
      required: ['key'],
    },
  },
];

// ── Browser lifecycle ─────────────────────────────────────────────────────────
async function ensureBrowser() {
  if (browser && browser.isConnected()) return;

  const launchOptions = { headless: HEADLESS };

  // CloakBrowser-specific options
  if (usingCloak) {
    if (HUMANIZE) launchOptions.humanize = true;
    if (GEOIP) launchOptions.geoip = GEOIP;
  }

  if (PROXY_URL) {
    launchOptions.proxy = { server: PROXY_URL };
  }

  try {
    browser = await chromium.launch(launchOptions);
    const label = usingCloak ? 'CloakBrowser' : 'Playwright';
    console.error(`[cloak-mcp] ${label} launched (headless=${HEADLESS}, humanize=${usingCloak && HUMANIZE}, proxy=${PROXY_URL || 'none'})`);
  } catch (err) {
    throw new Error(`Failed to launch browser: ${err.message}`);
  }
}

async function ensurePage() {
  await ensureBrowser();
  if (!page || page.isClosed()) {
    const context = await browser.newContext();
    page = await context.newPage();
    console.error('[cloak-mcp] New page created');
  }
}

// ── Tool handlers ─────────────────────────────────────────────────────────────
async function handleBrowserNavigate(args) {
  if (!args.url) throw new Error('url is required');
  await ensurePage();
  const response = await page.goto(args.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
  const title = await page.title();
  return `Navigated to ${args.url}\nTitle: ${title}\nStatus: ${response?.status() || 'N/A'}`;
}

async function handleBrowserClick(args) {
  if (!args.selector) throw new Error('selector is required');
  await ensurePage();
  await page.click(args.selector, { timeout: 10000 });
  return `Clicked element: ${args.selector}`;
}

async function handleBrowserType(args) {
  if (!args.selector) throw new Error('selector is required');
  if (args.text === undefined || args.text === null) throw new Error('text is required');
  await ensurePage();
  await page.fill(args.selector, args.text);
  return `Typed "${args.text}" into ${args.selector}`;
}

async function handleBrowserEvaluate(args) {
  if (!args.expression) throw new Error('expression is required');
  await ensurePage();
  const result = await page.evaluate(args.expression);
  return `Evaluation result: ${JSON.stringify(result, null, 2)}`;
}

async function handleBrowserSnapshot() {
  await ensurePage();
  try {
    // Try accessibility snapshot first (Playwright 1.44+)
    const snapshot = await page.accessibility.snapshot();
    if (snapshot) {
      return `Accessibility snapshot:\n${JSON.stringify(snapshot, null, 2)}`;
    }
  } catch {
    // Fallback to HTML summary
  }
  // Fallback: page title + URL + visible text
  const title = await page.title();
  const url = page.url();
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
  return `Page snapshot:\nURL: ${url}\nTitle: ${title}\nVisible text (first 5000 chars):\n${bodyText}`;
}

async function handleBrowserPressKey(args) {
  if (!args.key) throw new Error('key is required');
  await ensurePage();
  await page.keyboard.press(args.key);
  return `Pressed key: ${args.key}`;
}

const TOOL_HANDLERS = {
  browser_navigate: handleBrowserNavigate,
  browser_click: handleBrowserClick,
  browser_type: handleBrowserType,
  browser_evaluate: handleBrowserEvaluate,
  browser_snapshot: handleBrowserSnapshot,
  browser_press_key: handleBrowserPressKey,
};

// ── JSON-RPC handling ─────────────────────────────────────────────────────────
function makeResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function makeError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  // No id → notification, no response needed
  if (id === undefined || id === null) return null;

  try {
    switch (method) {
      case 'initialize': {
        return makeResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: usingCloak ? 'cloak-browser-mcp' : 'playwright-mcp',
            version: '1.0.0',
          },
        });
      }

      case 'initialized': {
        // Client acknowledges initialization — no response
        return null;
      }

      case 'tools/list': {
        return makeResponse(id, { tools: TOOLS });
      }

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        const handler = TOOL_HANDLERS[toolName];
        if (!handler) {
          return makeError(id, -32601, `Unknown tool: ${toolName}`);
        }

        try {
          const text = await handler(toolArgs);
          return makeResponse(id, {
            content: [{ type: 'text', text: String(text) }],
          });
        } catch (toolErr) {
          return makeResponse(id, {
            content: [{ type: 'text', text: `Error: ${toolErr.message}` }],
            isError: true,
          });
        }
      }

      default: {
        return makeError(id, -32601, `Method not found: ${method}`);
      }
    }
  } catch (err) {
    return makeError(id, -32603, `Internal error: ${err.message}`);
  }
}

// ── Stdio transport ───────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  line = line.trim();
  if (!line) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(makeError(null, -32700, 'Parse error: invalid JSON') + '\n');
    return;
  }

  const response = await handleMessage(msg);
  if (response !== null) {
    process.stdout.write(response + '\n');
  }
});

rl.on('close', async () => {
  console.error('[cloak-mcp] Stdin closed, shutting down...');
  if (browser) {
    try { await browser.close(); } catch {}
  }
  process.exit(0);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  console.error('[cloak-mcp] Shutting down...');
  if (browser) {
    try { await browser.close(); } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (err) => {
  console.error(`[cloak-mcp] Uncaught exception: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[cloak-mcp] Unhandled rejection: ${reason}`);
});

console.error('[cloak-mcp] MCP server started on stdio');
console.error(`[cloak-mcp] Mode: ${usingCloak ? 'CloakBrowser (stealth)' : 'Playwright (standard)'}`);
console.error(`[cloak-mcp] Config: humanize=${HUMANIZE}, proxy=${PROXY_URL || 'none'}, geoip=${GEOIP || 'none'}, headless=${HEADLESS}`);
