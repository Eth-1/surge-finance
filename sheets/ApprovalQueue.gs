/**
 * ============================================================================
 * ApprovalQueue.gs — approval state machine (§3.3)
 * ============================================================================
 * recalculateApprovalStatus(row) recomputes col Q from cols O/P/U using the
 * configured Approval Mode (§3.3a) and the rejection interlock precedence
 * (§3.3d). Clearing an approval recomputes from scratch (§3.3c). The terminal
 * "Moved to Expenses" status is never overwritten.
 *
 * The onEdit handler (sequential gate + auto-approve) lives in this file too
 * (added in task 2.9). All callers run inside withLock.
 * ES5-compatible.
 * ============================================================================
 */

/**
 * Pure status computation. Inputs are raw cell values for O (coord), P (dir),
 * U (rejection reason); mode is the Approval Mode setting.
 * @return one of Pending | Coordinator Approved | Director Approved | Fully Approved | Rejected
 */
function computeApprovalStatus_(o, p, u, mode) {
  o = String(o == null ? '' : o).trim();
  p = String(p == null ? '' : p).trim();
  u = String(u == null ? '' : u).trim();

  // Rejection precedence (§3.3d): col U text OR an O/P "Rejected" → Rejected.
  if (u !== '' || o === 'Rejected' || p === 'Rejected') { return 'Rejected'; }

  var hasCoord = (o !== '' && o !== 'Rejected');
  var hasDir = (p !== '' && p !== 'Rejected');
  if (!hasCoord && !hasDir) { return 'Pending'; }

  switch (String(mode || '')) {
    case 'Independent':
      // Approvals are independent — either single approval suffices.
      return 'Fully Approved';
    case 'Sequential':
      if (hasCoord && hasDir) { return 'Fully Approved'; }
      if (hasCoord) { return 'Coordinator Approved'; }
      return 'Pending';   // director-only is blocked by the gate (§3.3a / 2.9)
    case 'Both Required':
      if (hasCoord && hasDir) { return 'Fully Approved'; }
      if (hasCoord) { return 'Coordinator Approved'; }
      return 'Director Approved';
    default:
      return 'Fully Approved';
  }
}

/**
 * Recalculate and (if changed) write the Approval Status for one AQ row.
 * Skips terminal "Moved to Expenses". Stamps Last Modified + audits the
 * transition. Must be called inside withLock.
 */
function recalculateApprovalStatus(row) {
  if (row < 2) { return; }
  var sh = getSheet_(SHEETS.APPROVAL_QUEUE);
  // Read O..U (cols 15–21) in one shot: [O, P, Q, R, S, T, U].
  var span = sh.getRange(row, COLS.AQ.COORD_APPROVAL, 1, 7).getValues()[0];
  var o = span[0], p = span[1];
  var curStatus = String(span[2] == null ? '' : span[2]).trim();
  var u = span[6];

  if (curStatus === 'Moved to Expenses') { return; }   // terminal — never recompute

  var newStatus = computeApprovalStatus_(o, p, u, getCfg().approvalMode);
  if (newStatus === curStatus) { return; }

  var rowId = sh.getRange(row, COLS.AQ.ROW_ID).getValue();
  sh.getRange(row, COLS.AQ.APPROVAL_STATUS).setValue(newStatus);
  touchLastModified(sh, row);

  if (newStatus === 'Rejected') {
    logToAudit('REJECTION', { sheet: SHEETS.APPROVAL_QUEUE, recordId: rowId,
      field: 'Approval Status', oldValue: curStatus, newValue: newStatus });
  } else if (newStatus !== 'Pending') {
    logToAudit('APPROVAL', { sheet: SHEETS.APPROVAL_QUEUE, recordId: rowId,
      field: 'Approval Status', oldValue: curStatus, newValue: newStatus });
  }

  // Significant change → near-real-time revalidation (D1). Guarded: notify
  // helper is defined in Dashboard.gs; harmless before it exists.
  try { notifyRevalidate_('dashboard'); } catch (e) {}
  try { notifyRevalidate_('submissions'); } catch (e2) {}
}

/* ------------------------------------------------------------------ *
 * 2.9 — Range-aware onEdit handler for the Approval Queue (§3.3h/F3)  *
 * ------------------------------------------------------------------ */
function handleApprovalQueueEdit_(e, info) {
  var sh = info.sheet;
  var cfg = getCfg();
  var touchedO = info.hasCol(COLS.AQ.COORD_APPROVAL);
  var touchedP = info.hasCol(COLS.AQ.DIR_APPROVAL);
  var touchedU = info.hasCol(COLS.AQ.REJECTION_REASON);
  var touchedQ = info.hasCol(COLS.AQ.APPROVAL_STATUS);   // manual tamper → recompute (authoritative)
  var touchedDate = info.hasCol(COLS.AQ.PURCHASE_DATE);
  var recalcNeeded = touchedO || touchedP || touchedU || touchedQ;

  eachDataRow_(info, function (row) {
    // Sequential-mode gate (§3.3a): block a Director APPROVAL while Coordinator is blank.
    // A "Rejected" in col P is never blocked (rejection overrides modes, §3.3d).
    if (touchedP && cfg.approvalMode === 'Sequential') {
      var oVal = String(sh.getRange(row, COLS.AQ.COORD_APPROVAL).getValue()).trim();
      var pVal = String(sh.getRange(row, COLS.AQ.DIR_APPROVAL).getValue()).trim();
      if (pVal !== '' && pVal !== 'Rejected' && oVal === '') {
        sh.getRange(row, COLS.AQ.DIR_APPROVAL).clearContent();
        safeToast_('Coordinator must approve first in Sequential mode.', 'Surge Finance', 5);
      }
    }
    if (recalcNeeded) { recalculateApprovalStatus(row); }
    if (touchedDate) { refreshReceiptAge_(sh, row); }
  });
}

/** Recompute the Receipt Age text (col N) for one AQ row (§5.7). Used onEdit + daily. */
function refreshReceiptAge_(sh, row) {
  var pd = toDate_(sh.getRange(row, COLS.AQ.PURCHASE_DATE).getValue());
  var text = '';
  if (pd) {
    var n = Math.max(0, daysSince(pd));
    text = (n > getCfg().receiptAgeThresholdDays) ? ('⚠️ ' + n + ' days old') : (n + ' days');
  }
  sh.getRange(row, COLS.AQ.RECEIPT_AGE).setValue(text);
}
