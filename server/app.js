/**
 * server/app.js
 * Slim Express entry point: mount routes, auth, rate limiter, graceful shutdown.
 */

const express = require('express');
const { chromium, usingCloak, HEADLESS, PORT, SESSION_TTL_MS } = require('./config');
const chatRouter = require('./routes/chat');
const adminRouter = require('./routes/admin');
const { shutdown } = require('./services/browser');
const { createRateLimiter } = require('./utils/rate-limit');

const authEnabled = process.env.AUTH_ENABLED === 'true';
const apiKey = process.env.AUTH_KEY || null;

const app = express();
app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  if (!authEnabled) return next();
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (apiKey && token !== apiKey) {
    return res.status(401).json({ error: { message: 'Invalid API key', type: 'auth_error' } });
  }
  next();
});

// Rate limiter
app.use(createRateLimiter(authEnabled));

// Mount routes
app.use(chatRouter);
app.use(adminRouter);

// Health check fallback
app.get('/health', (req, res) => res.json({ ok: true }));

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Start server
let server;
if (require.main === module) {
  console.log(`[bridge] Starting on :${PORT} (headless=${HEADLESS}, cloak=${usingCloak})`);
  server = app.listen(PORT, () => {
    console.log(`[bridge] Listening on http://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[bridge] SIGINT — shutting down...');
  await shutdown();
  if (server) server.close(() => process.exit(0));
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('[bridge] SIGTERM — shutting down...');
  await shutdown();
  if (server) server.close(() => process.exit(0));
  process.exit(0);
});

module.exports = app;
