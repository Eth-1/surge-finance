/**
 * ============================================================================
 * Lock.gs — concurrency control (§3.3g / F1, F2)
 * ============================================================================
 * The single concurrency mechanism for the system. Every status-mutating
 * handler runs inside withLock() so concurrent onEdit/menu executions are
 * serialized — there is NO optimistic versioning (a human keystroke cannot be
 * rejected after the fact). Each locked write also stamps Last Modified.
 * ES5-compatible.
 * ============================================================================
 */

/** Execution-local re-entrancy depth so nested withLock() calls don't re-lock. */
var _LOCK_DEPTH = 0;

/**
 * Run fn() while holding the script lock (waits up to 10s). If the lock can't
 * be acquired, toasts a friendly busy message and returns undefined WITHOUT
 * running fn — the caller must treat undefined as "did not run".
 * Nested calls within the same execution run fn() directly (lock already held).
 */
function withLock(fn) {
  if (_LOCK_DEPTH > 0) { return fn(); }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    safeToast_('System busy — please retry in a moment.', 'Surge Finance', 5);
    return;
  }
  _LOCK_DEPTH++;
  try {
    return fn();
  } finally {
    _LOCK_DEPTH--;
    lock.releaseLock();
  }
}

/**
 * Stamp Last Modified = now on a row (§3.3g). `col` defaults to the sheet's
 * known Last Modified column when omitted for the AQ/Expenses/CR sheets.
 */
function touchLastModified(sheet, row, col) {
  var c = col;
  if (!c) {
    var name = sheet.getName();
    if (name === SHEETS.APPROVAL_QUEUE) { c = COLS.AQ.LAST_MODIFIED; }
    else if (name === SHEETS.CR_TRACKER) { c = COLS.CR.LAST_MODIFIED; }
    else { return; }   // sheet has no Last Modified column
  }
  sheet.getRange(row, c).setValue(new Date());
}

/* ------------------------------------------------------------------ *
 * UI-safe toast — no-ops in web-app / headless contexts.              *
 * ------------------------------------------------------------------ */
function safeToast_(message, title, seconds) {
  try {
    SpreadsheetApp.getActive().toast(message, title || 'Surge Finance', seconds || 5);
  } catch (e) {
    // No active spreadsheet UI (e.g. web app / time-driven) — silently ignore.
  }
}

/** UI-safe alert dialog; returns true if confirmed (Yes/OK), false otherwise. */
function safeConfirm_(message, title) {
  try {
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert(title || 'Surge Finance', message, ui.ButtonSet.YES_NO);
    return resp === ui.Button.YES;
  } catch (e) {
    // No UI available — default to NOT confirmed (safe).
    return false;
  }
}
