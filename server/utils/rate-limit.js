/**
 * server/utils/rate-limit.js
 * Per-API-key rate limiting middleware for /v1/chat/completions.
 */

const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10); // 1 min
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10); // 30 req/min
const rateLimitCounts = {}; // key -> {count, resetAt}

/**
 * Create rate limiting middleware.
 * Only active when AUTH_ENABLED is true.
 */
function createRateLimiter(authEnabled) {
  return (req, res, next) => {
    if (!authEnabled) return next();
    const key = (req.headers['authorization']?.slice(7)) || req.query?.key || 'anonymous';
    const now = Date.now();
    if (!rateLimitCounts[key] || now > rateLimitCounts[key].resetAt) {
      rateLimitCounts[key] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    }
    rateLimitCounts[key].count++;
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - rateLimitCounts[key].count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitCounts[key].resetAt / 1000));
    if (rateLimitCounts[key].count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error', code: 'rate_limit_exceeded' } });
    }
    next();
  };
}

module.exports = { createRateLimiter, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX };
