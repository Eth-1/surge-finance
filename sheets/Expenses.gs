/**
 * ============================================================================
 * Expenses.gs — move to expenses, status transitions, unlink, undo (§3.4)
 * ============================================================================
 * moveRowToExpenses() is the validated AQ → Expenses writer. Status-change
 * handling, undo, and unlink are added in tasks 2.11–2.12.
 * All mutating functions run inside withLock (re-entrant — safe to call from
 * already-locked batch/auto-approve paths).
 * ES5-compatible.
 * ============================================================================
 */

/** Status Age live formula for an Expenses row (days since Timestamp, col B). */
function _statusAgeFormula_(row) {
  return '=IF($B' + row + '="","",TODAY()-INT($B' + row + '))';
}

/**
 * Move a Fully Approved Approval Queue row into Expenses (§3.3b, §4.5i/E3).
 * @param {number} row   1-based AQ row
 * @param {Object} opts  { silent: suppress toasts }
 * @return {Object} { moved, reason, rowId, expenseRow }
 */
function moveRowToExpenses(row, opts) {
  opts = opts || {};
  return withLock(function () {
    var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
    var a = aq.getRange(row, 1, 1, COLS.AQ.WIDTH).getValues()[0];
    var rowId = a[COLS.AQ.ROW_ID - 1];
    var status = String(a[COLS.AQ.APPROVAL_STATUS - 1] || '').trim();

    // Guard: only Fully Approved rows are eligible (§3.3b).
    if (status !== 'Fully Approved') {
      return { moved: false, reason: 'not Fully Approved (' + status + ')', rowId: rowId };
    }

    // Required-field validation (E3 / §4.5i).
    var project = String(a[COLS.AQ.STD_PROJECT - 1] || '').trim();
    var category = String(a[COLS.AQ.CATEGORY - 1] || '').trim();
    if (!project) {
      if (!opts.silent) { safeToast_('Please assign a Project before moving to Expenses.', 'Surge Finance', 6); }
      return { moved: false, reason: 'missing Project', rowId: rowId };
    }
    if (!category) {
      if (!opts.silent) { safeToast_('Please assign a Category before moving to Expenses.', 'Surge Finance', 6); }
      return { moved: false, reason: 'missing Category', rowId: rowId };
    }

    var cfg = getCfg();
    var purchaseDate = toDate_(a[COLS.AQ.PURCHASE_DATE - 1]);
    var amount = coalesceAmount(a[COLS.AQ.VERIFIED_AMOUNT - 1], a[COLS.AQ.AMOUNT - 1]);
    var fyLabel = fiscalYearForDate(purchaseDate || a[COLS.AQ.TIMESTAMP - 1]).label;

    // Preserve the receipt hyperlink formula if present (else the display value).
    var receiptFormula = aq.getRange(row, COLS.AQ.RECEIPT_FILE).getFormula();
    var receiptCell = receiptFormula ? receiptFormula : a[COLS.AQ.RECEIPT_FILE - 1];

    var exp = getSheet_(SHEETS.EXPENSES);
    var newRow = exp.getLastRow() + 1;

    var expArr = [
      rowId,                              // A Row ID (preserved)
      a[COLS.AQ.TIMESTAMP - 1],           // B Timestamp
      a[COLS.AQ.FULL_NAME - 1],           // C Full Name
      a[COLS.AQ.EMAIL - 1],               // D Email
      project,                            // E Standardized Project
      purchaseDate,                       // F Purchase Date
      amount,                             // G Verified Amount (COALESCE)
      a[COLS.AQ.VENDOR - 1],              // H Vendor
      a[COLS.AQ.DESCRIPTION - 1],         // I Description
      category,                           // J Category
      a[COLS.AQ.PRE_APPROVED - 1],        // K Pre-Approved?
      receiptCell,                        // L Receipt File (hyperlink)
      '',                                 // M Funding Source (manual)
      '',                                 // N Cheque Requisition #
      'Approved',                         // O Reimbursement Status
      '',                                 // P Payment Date
      '',                                 // Q Payment Method
      cfg.defaultPayee,                   // R Payee
      _statusAgeFormula_(newRow),         // S Status Age (live)
      '',                                 // T Follow-Up Flag
      '',                                 // U Internal Notes
      'Receipt',                          // V Expense Type
      fyLabel                             // W Fiscal Year
    ];
    exp.getRange(newRow, 1, 1, COLS.EXP.WIDTH).setValues([expArr]);

    // Verify the write landed (Row ID matches) before mutating AQ.
    var written = exp.getRange(newRow, COLS.EXP.ROW_ID).getValue();
    if (String(written) !== String(rowId)) {
      logError({ sheet: SHEETS.EXPENSES, recordId: rowId, message: 'move verify failed at row ' + newRow });
      return { moved: false, reason: 'write verification failed', rowId: rowId };
    }

    // Mark AQ row terminal. The "Moved to Expenses" CF rule grays the row
    // automatically; Source Row (W) records the AQ Row ID for undo (F8).
    aq.getRange(row, COLS.AQ.APPROVAL_STATUS).setValue('Moved to Expenses');
    aq.getRange(row, COLS.AQ.SOURCE_ROW).setValue(rowId);
    touchLastModified(aq, row);

    logToAudit('MOVE_TO_EXPENSES', {
      sheet: SHEETS.EXPENSES, recordId: rowId,
      newValue: project + ' / ' + category + ' / ' + formatCAD(amount)
    });
    if (!opts.silent) { safeToast_('Moved ' + rowId + ' to Expenses.', 'Surge Finance', 4); }

    try { notifyRevalidate_('dashboard'); } catch (e) {}
    try { notifyRevalidate_('submissions'); } catch (e2) {}

    return { moved: true, rowId: rowId, expenseRow: newRow };
  });
}

/* ------------------------------------------------------------------ *
 * 2.11 — Undo Move to Expenses (§3.4d / F8) — Director-only           *
 * ------------------------------------------------------------------ */
function undoMoveToExpenses(expenseRow) {
  return withLock(function () {
    if (!requireDirector_('Undo Move to Expenses')) { return { ok: false, reason: 'permission' }; }
    var exp = getSheet_(SHEETS.EXPENSES);
    if (expenseRow < 2 || expenseRow > exp.getLastRow()) {
      safeToast_('Select a single Expenses row to revert.', 'Surge Finance', 5);
      return { ok: false, reason: 'no-row' };
    }
    var r = exp.getRange(expenseRow, 1, 1, COLS.EXP.WIDTH).getValues()[0];
    var rowId = r[COLS.EXP.ROW_ID - 1];
    var status = String(r[COLS.EXP.REIMB_STATUS - 1] || '').trim();
    var crNum = String(r[COLS.EXP.CR_NUMBER - 1] || '').trim();

    // Guard: only an untouched, Approved, CR-free expense can be reverted.
    if (status !== 'Approved' || crNum) {
      safeToast_('Can only revert an expense still "Approved" with no CR. Unlink/clear first.', 'Surge Finance', 7);
      return { ok: false, reason: 'not-revertible' };
    }

    // Locate the original AQ row by Row-ID match (never by stale index — F8).
    var aqRow = findRowByValue_(SHEETS.APPROVAL_QUEUE, COLS.AQ.ROW_ID, rowId);
    if (!aqRow) {
      safeToast_('Original Approval Queue row not found — cannot auto-restore. The Expenses row was left unchanged.', 'Surge Finance', 9);
      return { ok: false, reason: 'aq-not-found' };
    }

    var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
    aq.getRange(aqRow, COLS.AQ.APPROVAL_STATUS).setValue('Fully Approved');  // CF restores formatting
    aq.getRange(aqRow, COLS.AQ.SOURCE_ROW).clearContent();
    touchLastModified(aq, aqRow);
    exp.deleteRow(expenseRow);

    logToAudit('UNDO_MOVE_TO_EXPENSES', { sheet: SHEETS.EXPENSES, recordId: rowId, newValue: 'restored to AQ row ' + aqRow });
    safeToast_('Reverted ' + rowId + ' to the Approval Queue (Fully Approved).', 'Surge Finance', 5);
    try { notifyRevalidate_('dashboard'); } catch (e) {}
    try { notifyRevalidate_('submissions'); } catch (e2) {}
    return { ok: true, rowId: rowId, aqRow: aqRow };
  });
}

/* ------------------------------------------------------------------ *
 * 2.11 — Unlink an expense from its CR (§3.4c) — triggered by         *
 * clearing the Cheque Requisition # (col N) on an Expense row.        *
 * ------------------------------------------------------------------ */
function unlinkExpenseFromCR(expenseRow, oldCrNumber) {
  var crNum = String(oldCrNumber || '').trim();
  if (!crNum) { return { ok: false, reason: 'no-cr' }; }
  var exp = getSheet_(SHEETS.EXPENSES);
  var rowId = exp.getRange(expenseRow, COLS.EXP.ROW_ID).getValue();

  // Guard: cannot unlink once the cheque is issued (§3.4c).
  var crRow = findRowByValue_(SHEETS.CR_TRACKER, COLS.CR.CR_NUMBER, crNum);
  if (crRow) {
    var crStatus = String(getSheet_(SHEETS.CR_TRACKER).getRange(crRow, COLS.CR.STATUS).getValue() || '').trim();
    if (crStatus === 'Cheque Received' || crStatus === 'Distributed') {
      exp.getRange(expenseRow, COLS.EXP.CR_NUMBER).setValue(crNum);   // restore the link
      safeToast_('Cannot unlink — cheque already received for this CR.', 'Surge Finance', 7);
      return { ok: false, reason: 'cheque-issued' };
    }
  }

  // Revert this expense to Approved (col N already cleared by the edit).
  exp.getRange(expenseRow, COLS.EXP.REIMB_STATUS).setValue('Approved');

  // Recompute the old CR's totals/count/description (defined in CRTracker.gs).
  try { recalcCR(crNum); } catch (e) { logError({ sheet: SHEETS.CR_TRACKER, recordId: crNum, message: 'recalcCR after unlink: ' + e.message }); }

  logToAudit('CR_UNLINK', { sheet: SHEETS.EXPENSES, recordId: rowId, field: 'Cheque Requisition #', oldValue: crNum, newValue: '' });
  try { notifyRevalidate_('dashboard'); } catch (e3) {}
  return { ok: true, rowId: rowId, crNumber: crNum };
}

/* ------------------------------------------------------------------ *
 * 2.12 — Range-aware onEdit handler for Expenses (§3.4, X3, F7)       *
 * ------------------------------------------------------------------ */
function handleExpensesEdit_(e, info) {
  var sh = info.sheet;
  var touchedStatus = info.hasCol(COLS.EXP.REIMB_STATUS);
  var touchedCR = info.hasCol(COLS.EXP.CR_NUMBER);
  var touchedDate = info.hasCol(COLS.EXP.PURCHASE_DATE);
  var touchedAmount = info.hasCol(COLS.EXP.VERIFIED_AMOUNT);
  var singleCell = (info.numRows === 1 && info.numCols === 1);
  var wideEdit = info.numCols >= 5;   // likely a legacy row paste (§3.3h)

  eachDataRow_(info, function (row) {
    if (touchedDate || wideEdit) { normalizeExpenseRow_(sh, row); }   // FY (F7) + Type + Status Age

    if (touchedCR) {
      var oldCr = singleCell ? String(e.oldValue || '').trim() : '';
      var newCr = String(sh.getRange(row, COLS.EXP.CR_NUMBER).getValue() || '').trim();
      if (!newCr && oldCr) {
        unlinkExpenseFromCR(row, oldCr);                       // §3.4c
      } else if (newCr) {
        try { recalcCR(newCr); } catch (e1) {}
        if (oldCr && oldCr !== newCr) { try { recalcCR(oldCr); } catch (e2) {} }
      }
    }

    if (touchedStatus) { onExpenseStatusEdit_(sh, row, singleCell ? e.oldValue : null); }

    if (touchedAmount && !touchedCR) {
      var cr = String(sh.getRange(row, COLS.EXP.CR_NUMBER).getValue() || '').trim();
      if (cr) { try { recalcCR(cr); } catch (e3) {} }
    }
  });
  try { notifyRevalidate_('dashboard'); } catch (e4) {}
}

/** Legacy-paste / edit normalization: Expense Type default, Fiscal Year (F7), Status Age. */
function normalizeExpenseRow_(sh, row) {
  var typeCell = sh.getRange(row, COLS.EXP.EXPENSE_TYPE);
  if (!String(typeCell.getValue()).trim()) { typeCell.setValue('Receipt'); }
  var pd = toDate_(sh.getRange(row, COLS.EXP.PURCHASE_DATE).getValue());
  if (pd) { sh.getRange(row, COLS.EXP.FISCAL_YEAR).setValue(fiscalYearForDate(pd).label); }
  var sAge = sh.getRange(row, COLS.EXP.STATUS_AGE);
  if (!sAge.getFormula() && !String(sAge.getValue()).trim()) { sAge.setFormula(_statusAgeFormula_(row)); }
}

/** Side effects on any Expenses Reimbursement Status change (§3.4e + X3 guards). */
function onExpenseStatusEdit_(sh, row, oldStatus) {
  var d = sh.getRange(row, 1, 1, COLS.EXP.WIDTH).getValues()[0];
  var rowId = d[COLS.EXP.ROW_ID - 1];
  var status = String(d[COLS.EXP.REIMB_STATUS - 1] || '').trim();
  var crNum = String(d[COLS.EXP.CR_NUMBER - 1] || '').trim();
  var payMethod = String(d[COLS.EXP.PAYMENT_METHOD - 1] || '').trim();

  logToAudit('STATUS_CHANGE', { sheet: SHEETS.EXPENSES, recordId: rowId,
    field: 'Reimbursement Status', oldValue: oldStatus || '', newValue: status });

  // Auto-fill Payment Date for paid states (§3.4e #4, X3).
  if ((status === 'Reimbursed' || status === 'Payment Received') && !toDate_(d[COLS.EXP.PAYMENT_DATE - 1])) {
    sh.getRange(row, COLS.EXP.PAYMENT_DATE).setValue(new Date());
    safeToast_('Payment Date auto-set to today — adjust if incorrect.', 'Surge Finance', 5);
  }

  // Soft cross-field guards (X3 / §4.5l) — warnings, never blocks.
  var crImplied = { 'CR Draft': 1, 'CR Ready to Submit': 1, 'CR Submitted': 1,
    'Awaiting Payment': 1, 'Follow Up Required': 1, 'Action Required': 1 };
  if (crImplied[status] && !crNum) {
    safeToast_('This status implies a CR, but no Cheque Requisition # is set. Did you mean to link a CR?', 'Surge Finance', 7);
  }
  if (status === 'Reimbursed' && !payMethod) {
    safeToast_('Marked Reimbursed with no Payment Method — please set one for reconciliation.', 'Surge Finance', 7);
  }

  refreshExpenseFollowUpFlag_(sh, row);

  // Receipt file → status folder (§3.4e #5), best-effort.
  if (getCfg().moveFilesOnStatusChange) {
    var fileId = extractDriveFileId(sh.getRange(row, COLS.EXP.RECEIPT_FILE).getFormula() || d[COLS.EXP.RECEIPT_FILE - 1]);
    if (fileId) {
      try { moveReceiptToStatusFolder_(fileId, statusFolderForReimbStatus_(status)); }
      catch (fe) {
        logFileError(rowId, 'status move: ' + fe.message);
        safeToast_('Status updated but file move failed — please move the file manually.', 'Surge Finance', 7);
      }
    }
  }
}

/** Recompute the Follow-Up Flag (col T) for one Expenses row (§5.12). Flag only. */
function refreshExpenseFollowUpFlag_(sh, row) {
  var cfg = getCfg();
  var d = sh.getRange(row, 1, 1, COLS.EXP.WIDTH).getValues()[0];
  var status = String(d[COLS.EXP.REIMB_STATUS - 1] || '').trim();
  var ts = toDate_(d[COLS.EXP.TIMESTAMP - 1]);
  var flag = '';
  var pending = { 'Awaiting Payment': 1, 'Follow Up Required': 1, 'CR Submitted': 1, 'Action Required': 1 };
  if (pending[status] && ts) {
    var w = weeksSince(ts);
    if (w >= cfg.paymentEscalationWeeks) { flag = '🔴 URGENT: ' + w + ' weeks awaiting payment'; }
    else if (w >= cfg.paymentFollowUpWeeks) { flag = '🟡 FOLLOW UP: ' + w + ' weeks awaiting payment'; }
  }
  sh.getRange(row, COLS.EXP.FOLLOWUP_FLAG).setValue(flag);
}

/** C3 backstop: an Expenses row was removed — recompute every CR's totals. */
function handleExpensesRowChange_() {
  var cr = getSheet_(SHEETS.CR_TRACKER);
  var last = cr.getLastRow();
  if (last < 2) { return; }
  var nums = cr.getRange(2, COLS.CR.CR_NUMBER, last - 1, 1).getValues();
  for (var i = 0; i < nums.length; i++) {
    var n = String(nums[i][0] || '').trim();
    if (n) { try { recalcCR(n); } catch (e) {} }
  }
  logToAudit('ROW_DELETED', { sheet: SHEETS.EXPENSES, newValue: 'Expenses row removed — recalculated all CR totals' });
  try { notifyRevalidate_('dashboard'); } catch (e2) {}
}
