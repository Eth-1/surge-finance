/**
 * ============================================================================
 * WebApp.gs — JSON API router (§6.1, §6.4)
 * ============================================================================
 * doGet/doPost dispatch on ?action=. Endpoint handlers live in WebAppEndpoints.gs
 * (3.4) and WebAppReports.gs (3.7).
 *
 * AUTH NOTE: Apps Script web apps CANNOT read HTTP request headers, so the §1.6
 * "Authorization: Bearer" token is passed as a `token` query param instead. The
 * Next.js server (not the browser) forwards it, so the password is still sent
 * only once (to authCheck) and the token is never exposed client-side — S2's
 * guarantee holds. authCheck/status/health are unauthenticated; all others
 * require a valid token OR the password param.
 * ES5-compatible.
 * ============================================================================
 */

var WEBAPP_VERSION = '2.2';

function doGet(e) { return _route_(e || { parameter: {} }); }
function doPost(e) { return _route_(e || { parameter: {} }); }

function _route_(e) {
  var action = (e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
  try {
    switch (action) {
      case 'health':       return jsonOut_(handleHealth_());
      case 'authCheck':    return jsonOut_(handleAuthCheck_(e));
      case 'status':       return jsonOut_(handleStatus_(e));
      case 'dashboard':    return _guard_(e, function () { return handleDashboard_(e); });
      case 'submissions':  return _guard_(e, function () { return handleSubmissions_(e); });
      case 'report':       return _guard_(e, function () { return handleReport_(e); });
      case 'yearend':      return _guard_(e, function () { return handleYearEnd_(e); });
      case 'budgetImpact': return _guard_(e, function () { return handleBudgetImpact_(e); });
      default:             return jsonOut_({ error: 'unknown_action', action: action });
    }
  } catch (err) {
    return jsonOut_({ error: 'server_error', message: String(err && err.message || err) });
  }
}

/** Serialize an object as a JSON HTTP response. */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** True if the request carries a valid token OR the correct password param. */
function requireAuth_(e) {
  var p = e.parameter || {};
  if (p.token && verifyToken(p.token)) { return true; }
  if (p.password && verifyPassword(p.password)) { return true; }
  return false;
}

/** Run `fn` only if authorized; otherwise return the unauthorized envelope. */
function _guard_(e, fn) {
  if (!requireAuth_(e)) { return jsonOut_({ error: 'unauthorized' }); }
  return jsonOut_(fn());
}

/** Best-effort client IP (Apps Script can't read it; Next.js forwards it as &ip=). */
function getClientIp_(e) {
  return (e.parameter && e.parameter.ip) ? String(e.parameter.ip) : 'edge';
}

/** Read the raw POST body as a parsed object ({} if none/invalid). */
function postBody_(e) {
  try {
    if (e && e.postData && e.postData.contents) { return JSON.parse(e.postData.contents); }
  } catch (x) {}
  return {};
}
