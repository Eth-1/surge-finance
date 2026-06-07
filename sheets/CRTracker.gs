/**
 * ============================================================================
 * CRTracker.gs — Cheque Requisition lifecycle (§2.7, §3.6, §5.11)
 * ============================================================================
 * createChequeRequisition() groups eligible Approved expenses into a new CR.
 * recalcCR() recomputes Total / # Expenses / Description / Funding Total Check
 * whenever expenses are linked or unlinked. Cascade / cancel / funding gate are
 * added in task 2.15. All mutating functions run inside withLock.
 * ES5-compatible.
 * ============================================================================
 */

/** CR Tracker dynamic layout: { fsStart, fsEnd, checkCol } from the header row. */
function getCRLayout_() {
  var cr = getSheet_(SHEETS.CR_TRACKER);
  var lastCol = cr.getLastColumn();
  var headers = cr.getRange(1, 1, 1, lastCol).getValues()[0];
  var checkCol = lastCol;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === 'Funding Total Check') { checkCol = i + 1; break; }
  }
  return { fsStart: COLS.CR.FS_START, fsEnd: checkCol - 1, checkCol: checkCol };
}

/** Build the Funding Total Check formula for a CR row (§2.7). */
function buildFundingCheckFormula_(row, layout) {
  var a = columnToLetter_(layout.fsStart) + row;
  var b = columnToLetter_(layout.fsEnd) + row;
  var sumRef = 'SUM(' + a + ':' + b + ')';
  return '=IF(' + sumRef + '=D' + row + ',"✅ Match","❌ Mismatch: "&TEXT(' + sumRef +
    ',"$#,##0.00")&" vs "&TEXT(D' + row + ',"$#,##0.00"))';
}

/** Next CR number for the current fiscal year per the configured format (§2.1). */
function nextCRNumber_() {
  var cfg = getCfg();
  var fy = currentFiscalYearCode();
  var withFy = String(cfg.crNumberingFormat || 'CR-{FY}-{###}').replace('{FY}', fy);
  var idx = withFy.indexOf('{###}');
  if (idx < 0) { idx = withFy.length; withFy = withFy + '{###}'; }
  var prefix = withFy.substring(0, idx);
  var suffix = withFy.substring(idx + 5);

  var cr = getSheet_(SHEETS.CR_TRACKER);
  var last = cr.getLastRow();
  var maxN = 0;
  if (last >= 2) {
    var nums = cr.getRange(2, COLS.CR.CR_NUMBER, last - 1, 1).getValues();
    for (var i = 0; i < nums.length; i++) {
      var v = String(nums[i][0] || '');
      if (v.indexOf(prefix) === 0 && (suffix === '' || v.substring(v.length - suffix.length) === suffix)) {
        var mid = v.substring(prefix.length, v.length - suffix.length);
        var n = parseInt(mid, 10);
        if (!isNaN(n) && n > maxN) { maxN = n; }
      }
    }
  }
  var next = (maxN > 0) ? (maxN + 1) : cfg.crNumberingStart;
  return prefix + padNum_(next, 3) + suffix;
}

/** Description template (§5.11). */
function crDescription_(event, count, total) {
  return 'Reimbursement for ' + (event || 'multiple projects') + ' expenses — ' +
    count + ' items totaling ' + formatCAD(total);
}

/* ------------------------------------------------------------------ *
 * Create a CR from selected/eligible Approved expenses (§5.11).       *
 * @param {number[]} expenseRows  1-based Expenses rows to group.       *
 * ------------------------------------------------------------------ */
function createChequeRequisition(expenseRows) {
  return withLock(function () {
    var exp = getSheet_(SHEETS.EXPENSES);
    var cfg = getCfg();
    var eligible = [];
    var total = 0;
    var projects = {};
    for (var i = 0; i < (expenseRows || []).length; i++) {
      var r = expenseRows[i];
      if (r < 2 || r > exp.getLastRow()) { continue; }
      var d = exp.getRange(r, 1, 1, COLS.EXP.WIDTH).getValues()[0];
      var status = String(d[COLS.EXP.REIMB_STATUS - 1] || '').trim();
      var crN = String(d[COLS.EXP.CR_NUMBER - 1] || '').trim();
      if (status === 'Approved' && !crN) {
        var amt = parseAmount(d[COLS.EXP.VERIFIED_AMOUNT - 1]);
        eligible.push({ row: r, amount: amt });
        total += amt;
        projects[String(d[COLS.EXP.STD_PROJECT - 1] || 'Unassigned')] = true;
      }
    }

    if (!eligible.length) {
      safeToast_('No eligible expenses selected (must be "Approved" with no CR).', 'Surge Finance', 6);
      return { ok: false, reason: 'none-eligible' };
    }
    if (cfg.maxExpensesPerCR > 0 && eligible.length > cfg.maxExpensesPerCR) {
      safeToast_('Too many expenses (' + eligible.length + ') — max per CR is ' + cfg.maxExpensesPerCR + '.', 'Surge Finance', 7);
      return { ok: false, reason: 'over-max' };
    }

    var projKeys = [];
    for (var p in projects) { if (projects.hasOwnProperty(p)) { projKeys.push(p); } }
    var event = (projKeys.length === 1) ? projKeys[0] : 'multiple projects';

    var crNum = nextCRNumber_();
    var cr = getSheet_(SHEETS.CR_TRACKER);
    var layout = getCRLayout_();
    var newRow = cr.getLastRow() + 1;

    var rowArr = [
      crNum, new Date(), cfg.defaultCRPayee, roundMoney(total), crDescription_(event, eligible.length, total),
      String(getSettingValue('Default Cheque Delivery') || 'Pick up on campus'), '', 'Draft', '', '', '',
      eligible.length, '=IF($B' + newRow + '="","",TODAY()-INT($B' + newRow + '))', '', '', new Date()
    ];
    for (var f = layout.fsStart; f <= layout.fsEnd; f++) { rowArr.push(0); }     // FS columns default 0
    rowArr.push(buildFundingCheckFormula_(newRow, layout));                       // Funding Total Check
    cr.getRange(newRow, 1, 1, rowArr.length).setValues([rowArr]);

    // Link each expense: set CR# and status → CR Draft.
    for (var j = 0; j < eligible.length; j++) {
      exp.getRange(eligible[j].row, COLS.EXP.CR_NUMBER).setValue(crNum);
      exp.getRange(eligible[j].row, COLS.EXP.REIMB_STATUS).setValue('CR Draft');
    }

    logToAudit('CR_CREATED', { sheet: SHEETS.CR_TRACKER, recordId: crNum,
      newValue: eligible.length + ' items totaling ' + formatCAD(total) });
    safeToast_('Created ' + crNum + ' (' + eligible.length + ' items, ' + formatCAD(total) + ').', 'Surge Finance', 5);
    try { notifyRevalidate_('dashboard'); } catch (e) {}
    return { ok: true, crNumber: crNum, count: eligible.length, total: roundMoney(total) };
  });
}

/* ------------------------------------------------------------------ *
 * Recompute a CR's Total / # Expenses / Description / check on        *
 * link/unlink/delete (§5.11). Safe to call repeatedly.                *
 * ------------------------------------------------------------------ */
function recalcCR(crNumber) {
  var crNum = String(crNumber || '').trim();
  if (!crNum) { return; }
  var crRow = findRowByValue_(SHEETS.CR_TRACKER, COLS.CR.CR_NUMBER, crNum);
  if (!crRow) { return; }

  var exp = getSheet_(SHEETS.EXPENSES);
  var last = exp.getLastRow();
  var total = 0, count = 0;
  var projects = {};
  if (last >= 2) {
    var data = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][COLS.EXP.CR_NUMBER - 1] || '').trim() === crNum) {
        total += parseAmount(data[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
        count++;
        projects[String(data[i][COLS.EXP.STD_PROJECT - 1] || 'Unassigned')] = true;
      }
    }
  }
  var projKeys = [];
  for (var p in projects) { if (projects.hasOwnProperty(p)) { projKeys.push(p); } }
  var event = (projKeys.length === 1) ? projKeys[0] : 'multiple projects';

  var cr = getSheet_(SHEETS.CR_TRACKER);
  cr.getRange(crRow, COLS.CR.TOTAL_AMOUNT).setValue(roundMoney(total));
  cr.getRange(crRow, COLS.CR.NUM_EXPENSES).setValue(count);
  cr.getRange(crRow, COLS.CR.DESCRIPTION).setValue(crDescription_(event, count, total));

  // Ensure the Funding Total Check formula exists (legacy/safety).
  var layout = getCRLayout_();
  var checkCell = cr.getRange(crRow, layout.checkCol);
  if (!checkCell.getFormula()) { checkCell.setFormula(buildFundingCheckFormula_(crRow, layout)); }

  // C3: warn (without clobbering manual notes) when a CR has no expenses left.
  if (count === 0) {
    var notesCell = cr.getRange(crRow, COLS.CR.NOTES);
    if (!String(notesCell.getValue()).trim()) {
      notesCell.setValue('⚠️ All expenses removed — consider cancelling this CR.');
    }
  }
  touchLastModified(cr, crRow);
}

/* ================================================================== *
 * 2.15 — CR onEdit handler, status cascade, cancel, funding gate     *
 * ================================================================== */

/** CR status → Expense status propagation map (§3.4a). Draft/Cancelled handled separately. */
var CR_TO_EXPENSE_STATUS = {
  'Ready to Submit': 'CR Ready to Submit',
  'Submitted': 'CR Submitted',
  'Follow Up': 'Follow Up Required',
  'Action Required': 'Action Required',
  'Approved by SFSS': 'Awaiting Payment',
  'Cheque Received': 'Payment Received',
  'Distributed': 'Reimbursed'
};

function handleCRTrackerEdit_(e, info) {
  if (!info.hasCol(COLS.CR.STATUS)) { return; }
  var singleCell = (info.numRows === 1 && info.numCols === 1);
  eachDataRow_(info, function (row) {
    var newStatus = String(info.sheet.getRange(row, COLS.CR.STATUS).getValue() || '').trim();
    handleCRStatusChange_(row, newStatus, singleCell ? e.oldValue : '');
  });
}

function handleCRStatusChange_(row, newStatus, oldStatus) {
  var cr = getSheet_(SHEETS.CR_TRACKER);
  var crNum = String(cr.getRange(row, COLS.CR.CR_NUMBER).getValue() || '').trim();
  if (!crNum) { return; }

  // Soft guard (X3): advancing past Draft with no linked expenses.
  if (newStatus !== 'Draft' && newStatus !== 'Cancelled') {
    var count = parseAmount(cr.getRange(row, COLS.CR.NUM_EXPENSES).getValue());
    if (count === 0) {
      safeToast_('This CR has no linked expenses. Link expenses before submitting.', 'Surge Finance', 7);
    }
  }

  // Hard funding gate (E5 / §4.5k): block Ready to Submit / Submitted on mismatch.
  if (newStatus === 'Ready to Submit' || newStatus === 'Submitted') {
    var layout = getCRLayout_();
    var check = String(cr.getRange(row, layout.checkCol).getValue() || '');
    if (check.indexOf('Mismatch') > -1) {
      var revert = (oldStatus && String(oldStatus).trim()) ? String(oldStatus).trim() : 'Draft';
      cr.getRange(row, COLS.CR.STATUS).setValue(revert);
      var total = formatCAD(cr.getRange(row, COLS.CR.TOTAL_AMOUNT).getValue());
      safeToast_('Cannot submit — funding source allocation doesn\'t match CR total (' + total + '). Adjust the FS: columns first.', 'Surge Finance', 9);
      return;
    }
  }

  if (newStatus === 'Cancelled') { cancelCRInternal_(row, crNum, oldStatus); return; }

  logToAudit('CR_STATUS_CHANGE', { sheet: SHEETS.CR_TRACKER, recordId: crNum,
    field: 'Status', oldValue: oldStatus || '', newValue: newStatus });
  touchLastModified(cr, row);

  if (CR_TO_EXPENSE_STATUS[newStatus]) { cascadeCRStatus(crNum, newStatus); }   // Draft does not propagate
  try { notifyRevalidate_('dashboard'); } catch (e1) {}
  try { notifyRevalidate_('year-end'); } catch (e2) {}
}

/** Propagate a CR status to all linked expenses (§3.4a). Caller holds the lock. */
function cascadeCRStatus(crNumber, newStatus) {
  var target = CR_TO_EXPENSE_STATUS[newStatus];
  if (!target) { return; }
  var exp = getSheet_(SHEETS.EXPENSES);
  var last = exp.getLastRow();
  if (last < 2) { return; }
  var data = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
  var setPayDate = (target === 'Payment Received' || target === 'Reimbursed');
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][COLS.EXP.CR_NUMBER - 1] || '').trim() === String(crNumber)) {
      var row = i + 2;
      exp.getRange(row, COLS.EXP.REIMB_STATUS).setValue(target);
      if (setPayDate && !toDate_(data[i][COLS.EXP.PAYMENT_DATE - 1])) {
        exp.getRange(row, COLS.EXP.PAYMENT_DATE).setValue(new Date());
      }
      refreshExpenseFollowUpFlag_(exp, row);
      logToAudit('STATUS_CHANGE', { sheet: SHEETS.EXPENSES, recordId: data[i][COLS.EXP.ROW_ID - 1],
        field: 'Reimbursement Status', newValue: target, details: 'cascade from ' + crNumber });
    }
  }
}

/**
 * Cancel a CR (§3.6): Director-only. Reverts every linked expense to Approved
 * and clears its CR#. The cancelled CR row stays for audit. Caller holds lock.
 */
function cancelCRInternal_(row, crNum, oldStatus) {
  var cr = getSheet_(SHEETS.CR_TRACKER);
  if (!isDirector_()) {
    cr.getRange(row, COLS.CR.STATUS).setValue((oldStatus && String(oldStatus).trim()) ? String(oldStatus).trim() : 'Draft');
    safeToast_('Permission denied: cancelling a CR is Director-only.', 'Surge Finance', 6);
    return { ok: false, reason: 'permission' };
  }
  cr.getRange(row, COLS.CR.STATUS).setValue('Cancelled');

  var exp = getSheet_(SHEETS.EXPENSES);
  var last = exp.getLastRow();
  var reverted = 0;
  if (last >= 2) {
    var data = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][COLS.EXP.CR_NUMBER - 1] || '').trim() === String(crNum)) {
        var r = i + 2;
        exp.getRange(r, COLS.EXP.REIMB_STATUS).setValue('Approved');   // §3.4a Cancelled → Approved
        exp.getRange(r, COLS.EXP.CR_NUMBER).clearContent();
        reverted++;
      }
    }
  }
  cr.getRange(row, COLS.CR.NUM_EXPENSES).setValue(0);
  touchLastModified(cr, row);
  logToAudit('CR_CANCELLED', { sheet: SHEETS.CR_TRACKER, recordId: crNum,
    oldValue: oldStatus || '', newValue: 'reverted ' + reverted + ' expenses to Approved' });
  safeToast_('Cancelled ' + crNum + ' — ' + reverted + ' expense(s) reverted to Approved.', 'Surge Finance', 6);
  try { notifyRevalidate_('dashboard'); } catch (e) {}
  return { ok: true, reverted: reverted };
}

/** Menu entry: cancel the CR on `row` (Director-only). */
function cancelCR(row) {
  return withLock(function () {
    var cr = getSheet_(SHEETS.CR_TRACKER);
    if (row < 2 || row > cr.getLastRow()) {
      safeToast_('Select a CR Tracker row to cancel.', 'Surge Finance', 5);
      return { ok: false, reason: 'no-row' };
    }
    var crNum = String(cr.getRange(row, COLS.CR.CR_NUMBER).getValue() || '').trim();
    var oldStatus = String(cr.getRange(row, COLS.CR.STATUS).getValue() || '').trim();
    if (oldStatus === 'Cancelled') { safeToast_('This CR is already cancelled.', 'Surge Finance', 4); return { ok: false }; }
    return cancelCRInternal_(row, crNum, oldStatus);
  });
}
