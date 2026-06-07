/**
 * ============================================================================
 * Audit.gs — immutable action trail (§2.11, §3.10) with S7 user capture
 * ============================================================================
 * logToAudit() appends one row to the Audit Log. The User field uses the S7
 * fallback chain and NEVER logs a blank user. Audit logging is wrapped so a
 * logging failure can never break the operation being audited.
 * ES5-compatible.
 * ============================================================================
 */

/**
 * S7 user-capture fallback chain:
 *   activeUser → effectiveUser → form submitter (for form events) → "unknown@edit".
 * Never blank.
 */
function resolveAuditUser_(submitterEmail) {
  var u = '';
  try { u = Session.getActiveUser().getEmail(); } catch (e) {}
  if (!u) { try { u = Session.getEffectiveUser().getEmail(); } catch (e2) {} }
  if (!u && submitterEmail) { u = String(submitterEmail).trim(); }
  if (!u) { u = 'unknown@edit'; }
  return u;
}

/** Normalize a value for audit storage: dates formatted, long values truncated. */
function _auditVal_(v) {
  if (v === null || typeof v === 'undefined') { return ''; }
  if (v instanceof Date) { return formatDate(v, 'MMM d, yyyy h:mm a'); }
  var s = String(v);
  return s.length > 500 ? s.substring(0, 497) + '…' : s;
}

/**
 * Append an audit entry.
 * @param {string} action  one of §3.10's action types
 * @param {Object} opts  { sheet, recordId, field, oldValue, newValue, details, submitterEmail }
 */
function logToAudit(action, opts) {
  opts = opts || {};
  try {
    var sh = getSheet_(SHEETS.AUDIT_LOG);
    sh.appendRow([
      formatAuditTimestamp(new Date()),
      resolveAuditUser_(opts.submitterEmail),
      action,
      opts.sheet || '',
      opts.recordId || '',
      opts.field || '',
      _auditVal_(opts.oldValue),
      _auditVal_(opts.newValue),
      opts.details || ''
    ]);
  } catch (e) {
    try { Logger.log('logToAudit failed (' + action + '): ' + e.message); } catch (e2) {}
  }
}

/** Convenience: log an ERROR entry (§3.10). */
function logError(opts) {
  opts = opts || {};
  logToAudit('ERROR', {
    sheet: opts.sheet || '',
    recordId: opts.recordId || '',
    field: opts.field || '',
    newValue: opts.message || '',
    details: opts.details || ''
  });
}

/** Convenience: log a FILE_ERROR entry (§3.10, file ops §3.3f). */
function logFileError(recordId, message) {
  logToAudit('FILE_ERROR', { recordId: recordId, newValue: message });
}
