/**
 * ============================================================================
 * RateLimit.gs — backend protection (§6.6 / S1, S4)
 * ============================================================================
 * - Status circuit breaker: a rolling hourly execution budget (default 800/hr)
 *   so public /status traffic can never exhaust the shared Apps Script quota
 *   and lock finance out of the (token-gated) dashboard.
 * - authCheck limiter: 5 attempts / minute / IP to deter password brute-force.
 * Counters live in CacheService (approximate is fine for DoS mitigation).
 * ES5-compatible.
 * ============================================================================
 */

function _rateHit_(cache, key, ttlSeconds) {
  var cur = cache.get(key);
  var n = cur ? (parseInt(cur, 10) || 0) : 0;
  n++;
  cache.put(key, String(n), ttlSeconds);
  return n;
}

/** @return true if a status request is allowed; false if the hourly budget is exceeded. */
function checkStatusCircuitBreaker() {
  var cache = CacheService.getScriptCache();
  var bucket = Math.floor(Date.now() / 3600000);          // hourly bucket
  var n = _rateHit_(cache, 'cb_status_' + bucket, 3700);
  return n <= getCfg().statusCircuitBreakerPerHour;
}

/** @return true if an authCheck attempt from `ip` is allowed; false if over 5/min. */
function checkAuthRateLimit(ip) {
  var cache = CacheService.getScriptCache();
  var bucket = Math.floor(Date.now() / 60000);            // per-minute bucket
  var key = 'auth_' + (ip || 'noip') + '_' + bucket;
  var n = _rateHit_(cache, key, 70);
  return n <= getCfg().authCheckRateLimitPerMin;
}
