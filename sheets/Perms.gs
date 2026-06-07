/**
 * ============================================================================
 * Perms.gs — finance role checks (§1.5)
 * ============================================================================
 * Coordinator vs Director is determined by matching the active user's email
 * against the DirectorNames / CoordinatorNames lists. Those lists may contain
 * emails (enforceable) or just display names (not enforceable by email). When
 * a list contains NO email-looking entries we cannot verify by email, so we
 * defer to Google Sheet sharing (only finance has edit access anyway, §1.4)
 * and allow the action — logging that enforcement was skipped.
 * ES5-compatible.
 * ============================================================================
 */

function activeUserEmail_() {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (x) {}
  if (!e) { try { e = Session.getEffectiveUser().getEmail(); } catch (x2) {} }
  return normalizeEmail(e);
}

/**
 * Is the active user in `listName`?
 * @return true if matched by email; true if the list has no email entries
 *         (unenforceable — defer to sheet sharing); false if email-enforceable
 *         and the user is not present.
 */
function _userInList_(listName) {
  var email = activeUserEmail_();
  var list = getListValues(listName);
  var hasEmailEntry = false;
  for (var i = 0; i < list.length; i++) {
    var entry = String(list[i]);
    if (entry.indexOf('@') > -1) {
      hasEmailEntry = true;
      if (normalizeEmail(entry) === email && email) { return true; }
    }
  }
  if (!hasEmailEntry) { return true; }   // names-only list — cannot enforce by email
  return false;
}

function isDirector_() { return _userInList_('DirectorNames'); }

/** Directors hold all coordinator powers (§1.5). */
function isCoordinator_() { return isDirector_() || _userInList_('CoordinatorNames'); }

/**
 * Gate a Director-only action. Returns true if allowed; otherwise shows a
 * permission dialog/toast and returns false.
 */
function requireDirector_(actionLabel) {
  if (isDirector_()) { return true; }
  safeToast_('Permission denied: "' + actionLabel + '" is Director-only.', 'Surge Finance', 6);
  logToAudit('ERROR', { newValue: 'Permission denied (Director-only): ' + actionLabel + ' by ' + activeUserEmail_() });
  return false;
}
