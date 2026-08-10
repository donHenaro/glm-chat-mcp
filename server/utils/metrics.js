/**
 * server/utils/metrics.js
 * Prometheus-compatible metrics tracking.
 */

const state = require('../state');

const metrics = {
  requestsTotal: 0,
  requestsByModel: {},
  errorsTotal: 0,
  cacheHits: 0,
  cacheMisses: 0,
  fallbackRetries: 0,
  responseTimeSum: 0,
  responseTimeCount: 0,
  activeContexts: 0,
};

function getMetrics() {
  return metrics;
}

function formatPrometheus() {
  const m = metrics;
  const mem = process.memoryUsage();
  const sessions = Object.keys(state.sessions).length;
  const contexts = Object.keys(state.contexts).length;
  return [
    '# HELP glm_chat_requests_total Total number of chat completion requests',
    '# TYPE glm_chat_requests_total counter',
    `glm_chat_requests_total ${m.requestsTotal}`,
    '',
    '# HELP glm_chat_errors_total Total number of errors',
    '# TYPE glm_chat_errors_total counter',
    `glm_chat_errors_total ${m.errorsTotal}`,
    '',
    '# HELP glm_chat_cache_hits_total Cache hit count',
    '# TYPE glm_chat_cache_hits_total counter',
    `glm_chat_cache_hits_total ${m.cacheHits}`,
    '',
    '# HELP glm_chat_cache_misses_total Cache miss count',
    '# TYPE glm_chat_cache_misses_total counter',
    `glm_chat_cache_misses_total ${m.cacheMisses}`,
    '',
    '# HELP glm_chat_fallback_retries_total Fallback retry count',
    '# TYPE glm_chat_fallback_retries_total counter',
    `glm_chat_fallback_retries_total ${m.fallbackRetries}`,
    '',
    '# HELP glm_chat_response_time_ms Average response time in ms',
    '# TYPE glm_chat_response_time_ms gauge',
    `glm_chat_response_time_ms ${m.responseTimeCount > 0 ? Math.round(m.responseTimeSum / m.responseTimeCount) : 0}`,
    '',
    '# HELP glm_chat_active_sessions Active sessions',
    '# TYPE glm_chat_active_sessions gauge',
    `glm_chat_active_sessions ${sessions}`,
    '',
    '# HELP glm_chat_active_contexts Active browser contexts',
    '# TYPE glm_chat_active_contexts gauge',
    `glm_chat_active_contexts ${contexts}`,
    '',
    '# HELP glm_chat_memory_rss_bytes Process RSS memory in bytes',
    '# TYPE glm_chat_memory_rss_bytes gauge',
    `glm_chat_memory_rss_bytes ${mem.rss}`,
    '',
    '# HELP glm_chat_memory_heap_used_bytes Heap used in bytes',
    '# TYPE glm_chat_memory_heap_used_bytes gauge',
    `glm_chat_memory_heap_used_bytes ${mem.heapUsed}`,
    '',
    '# HELP glm_chat_uptime_seconds Process uptime in seconds',
    '# TYPE glm_chat_uptime_seconds gauge',
    `glm_chat_uptime_seconds ${process.uptime()}`,
  ].join('\n');
}

module.exports = { metrics, getMetrics, formatPrometheus };
