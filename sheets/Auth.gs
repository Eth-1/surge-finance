/**
 * ============================================================================
 * Auth.gs — password hashing + HMAC token sign/verify (§1.6 / S2)
 * ============================================================================
 * authCheck compares the POSTed password against the Dashboard Password setting
 * via salted hashes (plaintext never logged/reflected), then returns a signed,
 * short-lived token: payload {exp} + HMAC-SHA256 over base64url(payload) keyed
 * by a Script Property secret. Rotating the secret revokes all tokens.
 * ES5-compatible.
 * ============================================================================
 */

var _SECRET_PROP = 'SURGE_HMAC_SECRET';
var _REVALIDATE_PROP = 'SURGE_REVALIDATE_SECRET';

/** HMAC signing secret (auto-generated + persisted on first use). */
function getSecret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty(_SECRET_PROP);
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty(_SECRET_PROP, s); }
  return s;
}

/** Shared secret for the Next.js /api/revalidate webhook (D1). Mirror in Vercel env. */
function getRevalidateSecret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty(_REVALIDATE_PROP);
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty(_REVALIDATE_PROP, s); }
  return s;
}

/* ------------------------------ password ------------------------------ */

/** Salted SHA-256 hash (base64). The salt is the HMAC secret. */
function hashPassword(plain) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, getSecret() + ':' + String(plain == null ? '' : plain));
  return Utilities.base64Encode(bytes);
}

/** Compare a submitted password to the Dashboard Password setting via hashes. */
function verifyPassword(submitted) {
  if (submitted == null || String(submitted) === '') { return false; }
  return hashPassword(submitted) === hashPassword(getSettingValue('Dashboard Password'));
}

/* ------------------------------ tokens ------------------------------ */

function _b64urlEncodeStr_(str) {
  return Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
}
function _b64urlDecodeStr_(b64) {
  var s = String(b64);
  while (s.length % 4 !== 0) { s += '='; }
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}
function _hmacB64url_(message) {
  var raw = Utilities.computeHmacSha256Signature(message, getSecret());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

/** Sign a token whose payload is { exp: epoch-ms } (default 7-day expiry). */
function signToken() {
  var exp = Date.now() + getCfg().tokenExpiryDays * 86400000;
  var p = _b64urlEncodeStr_(JSON.stringify({ exp: exp }));
  return p + '.' + _hmacB64url_(p);
}

/** Validate a token's HMAC + expiry. Accepts a raw token or "Bearer <token>". */
function verifyToken(token) {
  try {
    var t = String(token || '');
    if (t.indexOf('Bearer ') === 0) { t = t.substring(7); }
    if (!t) { return false; }
    var parts = t.split('.');
    if (parts.length !== 2) { return false; }
    if (_hmacB64url_(parts[0]) !== parts[1]) { return false; }   // bad signature
    var payload = JSON.parse(_b64urlDecodeStr_(parts[0]));
    return !!payload.exp && Date.now() <= payload.exp;
  } catch (e) {
    return false;
  }
}
