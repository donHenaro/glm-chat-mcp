/**
 * server/routes/admin.js
 * Admin and monitoring endpoints: models, status, sessions, metrics.
 */

const express = require('express');
const router = express.Router();
const { PROVIDERS, DEFAULT_MODEL } = require('../config');
const state = require('../state');
const { metrics, formatPrometheus } = require('../utils/metrics');

/** GET /v1/models — list available models */
router.get('/v1/models', (req, res) => {
  const models = Object.keys(PROVIDERS).map(name => ({
    id: name,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: PROVIDERS[name].adapter,
  }));
  res.json({ object: 'list', data: models });
});

/** GET /v1/status — bridge health */
router.get('/v1/status', (req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    models: Object.keys(PROVIDERS),
    sessions: Object.keys(state.sessions).length,
    contexts: Object.keys(state.contexts).length,
  });
});

/** GET /v1/sessions — list active sessions */
router.get('/v1/sessions', (req, res) => {
  const sessions = Object.entries(state.sessions).map(([id, s]) => ({
    id,
    provider: s.provider?.url,
    adapter: s.provider?.adapter,
    lastUsed: s.lastUsed,
    messageCount: s.messages?.length || 0,
    pageOpen: s.page ? !s.page.isClosed() : false,
  }));
  res.json({ total: sessions.length, sessions });
});

/** GET /v1/sessions/:id/history — session message history */
router.get('/v1/sessions/:id/history', (req, res) => {
  const session = state.sessions[req.params.id];
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({
    id: req.params.id,
    messages: session.messages || [],
    provider: session.provider?.url,
    lastUsed: session.lastUsed,
  });
});

/** GET /metrics — Prometheus-compatible text metrics */
router.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(formatPrometheus());
});

module.exports = router;
