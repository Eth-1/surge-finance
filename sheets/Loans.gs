/**
 * ============================================================================
 * Loans.gs — member loan tracker (V3, ARCHITECTURE.md §4.2–4.3, §6.2)
 * ============================================================================
 * A LOAN = a member lent the club money (e.g. covered a large expense on a
 * personal card) that must be repaid once the SFSS cheque lands. Distinct from
 * a personal ADVANCE (treasurer paid a member out-of-pocket — Expenses col X).
 *
 * Rows are entered manually in the Loans sheet. The engine:
 *   - auto-assigns a Loan ID on first entry (audit LOAN_RECORDED)
 *   - computes Status from Amount Repaid vs Amount (never typed by hand)
 *   - autofills/clears Date Repaid; audits LOAN_REPAYMENT / LOAN_REPAID
 *   - flags overdue loans (Due Date passed, not Repaid) onEdit + daily
 *   - surfaces "ready to repay" when the linked CR is Distributed
 * All guards tolerate a missing Loans sheet (pre-migration installs).
 * ES5-compatible.
 * ============================================================================
 */

function generateLoanId() {
  return ('LOAN-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6)).toUpperCase();
}

/** Loans sheet or null when the workbook predates V3 (run migrateToV3). */
function getLoansSheet_() {
  return getSs_().getSheetByName(SHEETS.LOANS);
}

/* ------------------------------------------------------------------ *
 * onEdit handler (routed from Triggers.onSheetEdit, inside withLock)  *
 * ------------------------------------------------------------------ */
function handleLoansEdit_(e, info) {
  var sh = info.sheet;
  var singleRepaidEdit = (info.numRows === 1 && info.numCols === 1 && info.hasCol(COLS.LOAN.AMOUNT_REPAID));
  eachDataRow_(info, function (row) {
    recalcLoanRow_(sh, row, singleRepaidEdit ? e : null);
  });
  try { notifyRevalidate_('dashboard'); } catch (e2) {}
}

/** Recompute one loan row: ID, status, Date Repaid, follow-up flag, audits. */
function recalcLoanRow_(sh, row, repaidEditEvent) {
  var d = sh.getRange(row, 1, 1, COLS.LOAN.WIDTH).getValues()[0];
  var lender = String(d[COLS.LOAN.LENDER - 1] || '').trim();
  var amount = parseAmount(d[COLS.LOAN.AMOUNT - 1]);
  if (!lender && amount <= 0) { return; }   // empty / not-yet-real row

  // Auto-ID on first meaningful entry (also our LOAN_RECORDED audit point).
  var id = String(d[COLS.LOAN.ID - 1] || '').trim();
  if (!id) {
    id = generateLoanId();
    sh.getRange(row, COLS.LOAN.ID).setValue(id);
    logToAudit('LOAN_RECORDED', { sheet: SHEETS.LOANS, recordId: id,
      newValue: lender + ' lent ' + formatCAD(amount) });
  }

  // Status is derived, never authoritative from a paste/typo.
  var repaid = parseAmount(d[COLS.LOAN.AMOUNT_REPAID - 1]);
  var oldStatus = String(d[COLS.LOAN.STATUS - 1] || '').trim();
  var status = (repaid <= 0) ? 'Open'
    : (amount > 0 && repaid + 0.005 >= amount) ? 'Repaid'
    : 'Partially Repaid';

  if (repaidEditEvent && typeof repaidEditEvent.oldValue !== 'undefined') {
    logToAudit('LOAN_REPAYMENT', { sheet: SHEETS.LOANS, recordId: id,
      field: 'Amount Repaid', oldValue: repaidEditEvent.oldValue, newValue: formatCAD(repaid) });
  }

  if (status !== oldStatus) {
    sh.getRange(row, COLS.LOAN.STATUS).setValue(status);
    if (status === 'Repaid') {
      if (!toDate_(d[COLS.LOAN.DATE_REPAID - 1])) {
        sh.getRange(row, COLS.LOAN.DATE_REPAID).setValue(new Date());
      }
      logToAudit('LOAN_REPAID', { sheet: SHEETS.LOANS, recordId: id,
        newValue: lender + ' repaid in full (' + formatCAD(amount) + ')' });
    } else if (oldStatus === 'Repaid') {
      sh.getRange(row, COLS.LOAN.DATE_REPAID).clearContent();   // correction path
    }
  }

  refreshLoanFlag_(sh, row, status, d);
}

/** Overdue flag (col M): set when Due Date passed and the loan isn't Repaid. */
function refreshLoanFlag_(sh, row, status, d) {
  var flag = '';
  if (status !== 'Repaid') {
    var due = toDate_(d[COLS.LOAN.DUE_DATE - 1]);
    if (due) {
      var n = daysSince(due);
      if (n > 0) { flag = '⚠️ OVERDUE: ' + n + ' day' + (n === 1 ? '' : 's'); }
    }
  }
  sh.getRange(row, COLS.LOAN.FOLLOWUP_FLAG).setValue(flag);
}

/** Daily refresh of overdue flags (wired into dailyScheduledChecks). */
function refreshLoanFollowUps() {
  var sh = getLoansSheet_();
  if (!sh) { return; }
  var last = sh.getLastRow();
  if (last < 2) { return; }
  var data = sh.getRange(2, 1, last - 1, COLS.LOAN.WIDTH).getValues();
  for (var i = 0; i < data.length; i++) {
    var lender = String(data[i][COLS.LOAN.LENDER - 1] || '').trim();
    if (!lender && parseAmount(data[i][COLS.LOAN.AMOUNT - 1]) <= 0) { continue; }
    refreshLoanFlag_(sh, i + 2, String(data[i][COLS.LOAN.STATUS - 1] || 'Open').trim(), data[i]);
  }
}

/** CR-Distributed hook (called from handleCRStatusChange_): nudge repayment. */
function notifyLoansOfDistributedCR_(crNumber) {
  var sh = getLoansSheet_();
  if (!sh) { return; }
  var last = sh.getLastRow();
  if (last < 2) { return; }
  var data = sh.getRange(2, 1, last - 1, COLS.LOAN.WIDTH).getValues();
  var hits = 0;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][COLS.LOAN.LINKED_CR - 1] || '').trim() === String(crNumber) &&
        String(data[i][COLS.LOAN.STATUS - 1] || '').trim() !== 'Repaid') { hits++; }
  }
  if (hits > 0) {
    safeToast_(crNumber + ' distributed — ' + hits + ' linked member loan(s) can now be repaid (Loans sheet).', 'Surge Finance', 8);
  }
}

/* ------------------------------------------------------------------ *
 * Dashboard aggregation (read-only) — additive `loans` payload §2.4   *
 * ------------------------------------------------------------------ */
function computeLoansSummary_() {
  var empty = { outstandingTotal: 0, outstandingTotalDisplay: formatCAD(0), count: 0,
    overdueCount: 0, readyToRepayCount: 0, byLender: [] };
  var sh = getLoansSheet_();
  if (!sh) { return empty; }
  var last = sh.getLastRow();
  if (last < 2) { return empty; }

  // CR# → status map (to detect "linked CR distributed → ready to repay").
  var crStatus = {};
  var cr = getSheet_(SHEETS.CR_TRACKER), crLast = cr.getLastRow();
  if (crLast >= 2) {
    var cd = cr.getRange(2, 1, crLast - 1, COLS.CR.FIXED_WIDTH).getValues();
    for (var c = 0; c < cd.length; c++) {
      crStatus[String(cd[c][COLS.CR.CR_NUMBER - 1] || '').trim()] = String(cd[c][COLS.CR.STATUS - 1] || '').trim();
    }
  }

  var data = sh.getRange(2, 1, last - 1, COLS.LOAN.WIDTH).getValues();
  var byLender = {}, total = 0, count = 0, overdue = 0, ready = 0;
  for (var i = 0; i < data.length; i++) {
    var lender = String(data[i][COLS.LOAN.LENDER - 1] || '').trim();
    var amount = parseAmount(data[i][COLS.LOAN.AMOUNT - 1]);
    if (!lender || amount <= 0) { continue; }
    if (String(data[i][COLS.LOAN.STATUS - 1] || '').trim() === 'Repaid') { continue; }
    var repaid = Math.min(parseAmount(data[i][COLS.LOAN.AMOUNT_REPAID - 1]), amount);
    var owing = roundMoney(amount - repaid);
    if (owing <= 0) { continue; }
    total += owing; count++;
    var due = toDate_(data[i][COLS.LOAN.DUE_DATE - 1]);
    if (due && daysSince(due) > 0) { overdue++; }
    var linked = String(data[i][COLS.LOAN.LINKED_CR - 1] || '').trim();
    if (linked && crStatus[linked] === 'Distributed') { ready++; }
    if (!byLender[lender]) { byLender[lender] = { lender: lender, amount: 0, count: 0 }; }
    byLender[lender].amount += owing; byLender[lender].count++;
  }
  var arr = [];
  for (var k in byLender) {
    if (byLender.hasOwnProperty(k)) {
      arr.push({ lender: k, amount: roundMoney(byLender[k].amount),
        amountDisplay: formatCAD(byLender[k].amount), count: byLender[k].count });
    }
  }
  arr.sort(function (a, b) { return b.amount - a.amount; });
  return { outstandingTotal: roundMoney(total), outstandingTotalDisplay: formatCAD(total),
    count: count, overdueCount: overdue, readyToRepayCount: ready, byLender: arr };
}
