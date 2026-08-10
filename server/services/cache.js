/**
 * server/services/cache.js
 * Response cache with djb2 hashing, TTL, and eviction.
 */

const CACHE_ENABLED = process.env.CACHE !== 'false'; // default: enabled
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL || '300000', 10); // 5 min

/**
 * Compute a hash for the model+messages pair (djb2).
 */
function cacheHash(model, messages) {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const key = `${model}:${lastUserMsg}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash) + key.charCodeAt(i);
  return hash.toString(36);
}

/**
 * Get cached response by hash. Returns null on miss or TTL expiry.
 */
function cacheGet(hash, responseCache) {
  if (!CACHE_ENABLED) return null;
  const entry = responseCache[hash];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { delete responseCache[hash]; return null; }
  return entry.response;
}

/**
 * Store response in cache with LRU-style eviction.
 */
function cacheSet(hash, response, responseCache) {
  if (!CACHE_ENABLED) return;
  responseCache[hash] = { response, timestamp: Date.now() };
  const keys = Object.keys(responseCache);
  if (keys.length > 100) {
    const oldest = keys.reduce((a, b) => responseCache[a].timestamp < responseCache[b].timestamp ? a : b);
    delete responseCache[oldest];
  }
}

module.exports = { cacheHash, cacheGet, cacheSet };
