/**
 * ============================================================================
 * Utils.gs — money, dates, fiscal year, IDs, email, hyperlinks
 * ============================================================================
 * Pure helpers with no side effects. ES5-compatible.
 * ============================================================================
 */

/* ------------------------------------------------------------------ *
 * Money                                                               *
 * ------------------------------------------------------------------ */

/** Parse a currency-ish value to a number. Strips $ , and spaces. NaN → 0. §5.3 */
function parseAmount(value) {
  if (typeof value === 'number') { return value; }
  if (value === null || typeof value === 'undefined') { return 0; }
  var cleaned = String(value).replace(/[^0-9.\-]/g, '');
  var n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Round to 2 decimals (banker's-free, matches Math.round(v*100)/100). §5.1 */
function roundMoney(v) { return Math.round((Number(v) || 0) * 100) / 100; }

/** Format a number as CAD currency, e.g. 1234.5 → "$1,234.50". §5.3 */
function formatCAD(value) {
  var n = roundMoney(parseAmount(value));
  var neg = n < 0;
  n = Math.abs(n);
  var parts = n.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + parts[0] + '.' + parts[1];
}

/**
 * COALESCE(verified, submitted) — blank-based per §2.14: an explicitly entered
 * 0 in Verified IS honored; only a BLANK Verified falls back to Submitted.
 * Mirrors the Sheets formula IF(verified<>"", verified, submitted).
 */
function coalesceAmount(verified, submitted) {
  if (verified !== '' && verified !== null && typeof verified !== 'undefined') {
    var v = parseAmount(verified);
    if (!isNaN(v)) { return v; }
  }
  return parseAmount(submitted);
}

/* ------------------------------------------------------------------ *
 * IDs / email                                                         *
 * ------------------------------------------------------------------ */

/** EXP-{base36 timestamp}-{4 random chars}, uppercased. §2.1 */
function generateRowId() {
  return ('EXP-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6)).toUpperCase();
}

/** Normalize an email for matching: trim + lowercase. (X2) */
function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }

/* ------------------------------------------------------------------ *
 * Dates                                                               *
 * ------------------------------------------------------------------ */

function getTz_() {
  try { return getSs_().getSpreadsheetTimeZone(); }
  catch (e) { return Session.getScriptTimeZone(); }
}

/** Coerce a value to a Date or null. */
function toDate_(v) {
  if (v instanceof Date) { return isNaN(v.getTime()) ? null : v; }
  if (v === '' || v === null || typeof v === 'undefined') { return null; }
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a date with a pattern (default "MMM d, yyyy"). */
function formatDate(date, pattern) {
  var d = toDate_(date);
  if (!d) { return ''; }
  return Utilities.formatDate(d, getTz_(), pattern || 'MMM d, yyyy');
}

/** Audit timestamp format: "MMM d, yyyy, h:mm a" → e.g. "Jun 5, 2026, 9:00 AM". §2.11 */
function formatAuditTimestamp(date) {
  return formatDate(date || new Date(), 'MMM d, yyyy, h:mm a');
}

/** "yyyy-MM" key from a date (monthly chart grouping). §5.14 */
function monthKey(date) { return formatDate(date, 'yyyy-MM'); }

/** Whole days from a → b (b later). */
function daysBetween(a, b) {
  var da = toDate_(a), db = toDate_(b);
  if (!da || !db) { return 0; }
  return Math.floor((db.getTime() - da.getTime()) / 86400000);
}

function daysSince(date) { return daysBetween(date, new Date()); }
function weeksSince(date) { return Math.floor(daysSince(date) / 7); }

/* ------------------------------------------------------------------ *
 * Fiscal year (§5.4) — start configurable (default May 1)             *
 * ------------------------------------------------------------------ */

var _MONTH_INDEX = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

/** Parse the "Fiscal Year Start" setting (e.g. "May 1") → {m: 0-11, d: int}. */
function parseFiscalStart_() {
  var raw = String(getSettingValue('Fiscal Year Start') || 'May 1').trim();
  var parts = raw.split(/[\s,]+/);
  var m = _MONTH_INDEX[String(parts[0] || 'may').toLowerCase()];
  if (typeof m !== 'number') { m = 4; }
  var d = parseInt(parts[1], 10);
  if (isNaN(d) || d < 1) { d = 1; }
  return { m: m, d: d };
}

function _twoDigit_(year) { return String(year).slice(-2); }

/**
 * Resolve the fiscal year a date falls in.
 * @return { startYear, endYear, label:"FY 2025–2026", code:"2526" }
 */
function fiscalYearForDate(date) {
  var d = toDate_(date) || new Date();
  var fs = parseFiscalStart_();
  var y = d.getFullYear();
  var startThisYear = new Date(y, fs.m, fs.d);
  var startYear = (d.getTime() >= startThisYear.getTime()) ? y : (y - 1);
  var endYear = startYear + 1;
  return {
    startYear: startYear,
    endYear: endYear,
    label: 'FY ' + startYear + '–' + endYear,        // en-dash
    code: _twoDigit_(startYear) + _twoDigit_(endYear)      // e.g. "2526"
  };
}

/** Current FY label, e.g. "FY 2025–2026". */
function currentFiscalYearLabel() { return fiscalYearForDate(new Date()).label; }

/** Current FY 4-digit code, e.g. "2526". */
function currentFiscalYearCode() { return fiscalYearForDate(new Date()).code; }

/* ------------------------------------------------------------------ *
 * Hyperlinks                                                          *
 * ------------------------------------------------------------------ */

/** Build a =HYPERLINK() formula string. Returns "" if url is blank. */
function buildHyperlink(url, label) {
  var u = String(url || '').trim();
  if (!u) { return ''; }
  var safeUrl = u.replace(/"/g, '%22');
  var safeLabel = String(label || 'Open').replace(/"/g, "'");
  return '=HYPERLINK("' + safeUrl + '","' + safeLabel + '")';
}

/** Extract a Google Drive file ID from a share URL (or return "" if none). D5 */
function extractDriveFileId(url) {
  var s = String(url || '');
  var m = s.match(/[-\w]{25,}/);   // Drive IDs are 25+ url-safe chars
  return m ? m[0] : '';
}

/** Convert a 1-based column index to an A1 letter (1→A, 27→AA). */
function columnToLetter_(col) {
  var s = '';
  var n = col;
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Left-pad a number to at least `width` digits. */
function padNum_(n, width) {
  var s = String(n);
  while (s.length < width) { s = '0' + s; }
  return s;
}

/** Repeat a character n times (ES5-safe). */
function repeatChar_(ch, n) {
  var s = '';
  n = Math.max(0, n | 0);
  for (var i = 0; i < n; i++) { s += ch; }
  return s;
}
