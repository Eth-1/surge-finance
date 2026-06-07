/**
 * ============================================================================
 * Menu.gs — custom menu + single actions (§4.5h, §4.5m / X4)
 * ============================================================================
 * buildSurgeMenu_ is called from onOpen. Menu actions are thin wrappers around
 * the domain functions, operating on the active row / current selection.
 * Batch actions (2.22) and the Budget Impact modal (2.23) extend this file.
 * ES5-compatible.
 * ============================================================================
 */

function buildSurgeMenu_() {
  var ui = SpreadsheetApp.getUi();
  var ready = countFullyApproved_();
  ui.createMenu('⚡ Surge Finance')
    .addItem('Move to Expenses (' + ready + ' ready)', 'menuMoveActiveRow')
    .addItem('Move All Fully Approved', 'menuMoveAllFullyApproved')
    .addItem('Move Selected Rows', 'menuMoveSelected')
    .addSeparator()
    .addItem('Undo Move to Expenses', 'menuUndoMove')
    .addSeparator()
    .addItem('Create Cheque Requisition', 'menuCreateCR')
    .addItem('Cancel CR', 'menuCancelCR')
    .addItem('Delete Selected Expense…', 'menuDeleteExpense')
    .addSeparator()
    .addItem('Refresh Dashboard Data', 'menuRefreshDashboard')
    .addSeparator()
    .addItem('Year-End Rollover…', 'menuYearEndRollover')
    .addItem('Archive Prior Years', 'menuArchivePriorYears')
    .addToUi();

  // X4 onboarding nudge: point new treasurers at the menu action.
  if (ready > 0) {
    safeToast_(ready + ' item(s) are fully approved and ready — use ⚡ Surge Finance ▸ Move to Expenses.', 'Surge Finance', 8);
  }
}

/** Count Fully Approved rows in the Approval Queue (X4 menu badge). */
function countFullyApproved_() {
  var sh = getSheet_(SHEETS.APPROVAL_QUEUE);
  var last = sh.getLastRow();
  if (last < 2) { return 0; }
  var vals = sh.getRange(2, COLS.AQ.APPROVAL_STATUS, last - 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < vals.length; i++) { if (String(vals[i][0] || '').trim() === 'Fully Approved') { n++; } }
  return n;
}

/* ------------------------------ single actions ------------------------------ */

function menuMoveActiveRow() {
  var sh = _requireActiveSheet_(SHEETS.APPROVAL_QUEUE, 'the Approval Queue');
  if (!sh) { return; }
  var row = sh.getActiveCell().getRow();
  if (row < 2) { safeToast_('Select the row to move first.', 'Surge Finance', 4); return; }
  // 2.23 repoints this to the Budget Impact modal; for now move directly (validated).
  if (typeof showBudgetImpactForMove_ === 'function') { showBudgetImpactForMove_(row); }
  else { moveRowToExpenses(row); }
}

function menuUndoMove() {
  var sh = _requireActiveSheet_(SHEETS.EXPENSES, 'the Expenses sheet');
  if (!sh) { return; }
  undoMoveToExpenses(sh.getActiveCell().getRow());
}

function menuCreateCR() {
  var sh = _requireActiveSheet_(SHEETS.EXPENSES, 'the Expenses sheet');
  if (!sh) { return; }
  var rows = collectSelectedRows_(SHEETS.EXPENSES);
  if (!rows.length) { safeToast_('Select one or more Expenses rows to group into a CR.', 'Surge Finance', 5); return; }
  createChequeRequisition(rows);
}

function menuCancelCR() {
  var sh = _requireActiveSheet_(SHEETS.CR_TRACKER, 'the CR Tracker');
  if (!sh) { return; }
  cancelCR(sh.getActiveCell().getRow());
}

function menuRefreshDashboard() {
  try {
    if (typeof refreshDashboardData === 'function') { refreshDashboardData(); }
    else { scheduledRecalc(); }
    safeToast_('Dashboard data refreshed.', 'Surge Finance', 4);
  } catch (e) {
    logError({ sheet: 'System', message: 'menuRefreshDashboard: ' + e.message });
    safeToast_('Refresh failed — see Audit Log.', 'Surge Finance', 5);
  }
}

function menuYearEndRollover() {
  var items = computeYearEndChecklist_();
  var lines = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var mark = it.ok ? '✅' : '⚠️';
    lines.push(mark + ' ' + it.item + (it.ok ? '' : ' — ' + it.count + ' remaining') + (it.info ? ' (' + it.info + ')' : ''));
  }
  try {
    SpreadsheetApp.getUi().alert('Year-End Rollover Checklist', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    safeToast_('Year-end checklist computed — view at /year-end.', 'Surge Finance', 5);
  }
}

function menuArchivePriorYears() { archivePriorYears_(); }

/* ------------------------------ selection helpers ------------------------------ */

/** Active sheet must be `name`; returns it or toasts and returns null. */
function _requireActiveSheet_(name, label) {
  var sh = getSs_().getActiveSheet();
  if (sh.getName() !== name) {
    safeToast_('Switch to ' + (label || name) + ' first.', 'Surge Finance', 5);
    return null;
  }
  return sh;
}

/** Collect unique data-row indices (≥2) from the active selection (non-contiguous, X1). */
function collectSelectedRows_(sheetName) {
  var sh = getSs_().getActiveSheet();
  if (sh.getName() !== sheetName) { return []; }
  var ranges;
  try { ranges = sh.getActiveRangeList().getRanges(); }
  catch (e) { ranges = [sh.getActiveRange()]; }
  var seen = {}, rows = [];
  for (var i = 0; i < ranges.length; i++) {
    var start = ranges[i].getRow();
    var n = ranges[i].getNumRows();
    for (var r = start; r < start + n; r++) {
      if (r >= 2 && !seen[r]) { seen[r] = true; rows.push(r); }
    }
  }
  return rows;
}

/* ============================================================================ *
 * 2.22 — Batch Move to Expenses (§4.5h / E1, X1) + safe delete (C3)
 * ============================================================================ */

function menuMoveAllFullyApproved() {
  var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
  var last = aq.getLastRow();
  var rows = [];
  if (last >= 2) {
    var st = aq.getRange(2, COLS.AQ.APPROVAL_STATUS, last - 1, 1).getValues();
    for (var i = 0; i < st.length; i++) { if (String(st[i][0] || '').trim() === 'Fully Approved') { rows.push(i + 2); } }
  }
  if (!rows.length) { safeToast_('No Fully Approved rows to move.', 'Surge Finance', 5); return; }
  batchMove_(rows);
}

function menuMoveSelected() {
  var rows = collectSelectedRows_(SHEETS.APPROVAL_QUEUE);
  if (!rows.length) { safeToast_('Select one or more Approval Queue rows first.', 'Surge Finance', 5); return; }
  batchMove_(rows);
}

/** Pre-flight → confirm → move → persistent results panel. */
function batchMove_(rows) {
  return withLock(function () {
    var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
    var targets = [], skips = [], byProject = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var d = aq.getRange(r, 1, 1, COLS.AQ.WIDTH).getValues()[0];
      if (String(d[COLS.AQ.APPROVAL_STATUS - 1] || '').trim() !== 'Fully Approved') { continue; } // ignored, not error
      var rowId = d[COLS.AQ.ROW_ID - 1];
      var project = String(d[COLS.AQ.STD_PROJECT - 1] || '').trim();
      var category = String(d[COLS.AQ.CATEGORY - 1] || '').trim();
      if (!project) { skips.push({ row: r, rowId: rowId, reason: 'missing Project' }); continue; }
      if (!category) { skips.push({ row: r, rowId: rowId, reason: 'missing Category' }); continue; }
      var amt = coalesceAmount(d[COLS.AQ.VERIFIED_AMOUNT - 1], d[COLS.AQ.AMOUNT - 1]);
      targets.push({ row: r, rowId: rowId });
      byProject[project] = (byProject[project] || 0) + amt;
    }

    if (!targets.length && !skips.length) { safeToast_('No Fully Approved rows to move.', 'Surge Finance', 5); return; }

    var lines = ['Move ' + targets.length + ' item(s) to Expenses:'];
    for (var p in byProject) { if (byProject.hasOwnProperty(p)) { lines.push('  • ' + p + ': ' + formatCAD(byProject[p])); } }
    if (skips.length) {
      lines.push('', 'Will be SKIPPED (' + skips.length + '):');
      for (var s = 0; s < skips.length; s++) { lines.push('  ⚠️ ' + skips[s].rowId + ' — ' + skips[s].reason); }
    }
    if (!_confirm_('Batch Move to Expenses', lines.join('\n'))) { return; }

    var moved = [];
    for (var t = 0; t < targets.length; t++) {
      var res = moveRowToExpenses(targets[t].row, { silent: true });
      if (res && res.moved) { moved.push(targets[t].rowId); }
      else { skips.push({ row: targets[t].row, rowId: targets[t].rowId, reason: (res && res.reason) || 'move failed' }); }
    }
    for (var k = 0; k < skips.length; k++) { _highlightSkippedRow_(aq, skips[k].row); }

    logToAudit('MOVE_TO_EXPENSES', { sheet: SHEETS.APPROVAL_QUEUE,
      newValue: 'Batch: moved ' + moved.length + ', skipped ' + skips.length });
    _showBatchResultsPanel_(moved, skips);
    try { notifyRevalidate_('dashboard'); } catch (e) {}
    try { notifyRevalidate_('submissions'); } catch (e2) {}
  });
}

/** X1: mark a skipped row so the culprit is findable after the toast/panel closes. */
function _highlightSkippedRow_(aq, row) {
  if (!row || row < 2) { return; }
  try { aq.getRange(row, 1, 1, COLS.AQ.WIDTH).setBackground('#FFF3CD'); } catch (e) {}
  aq.getRange(row, COLS.AQ.INTERNAL_NOTES).setValue('⚠️ Skipped in batch move: assign Project/Category.');
}

/** Persistent results sidebar (X1) — stays open until dismissed. */
function _showBatchResultsPanel_(moved, skips) {
  var html = '<div style="font-family:Arial,sans-serif;padding:8px;font-size:13px">';
  html += '<h3 style="margin:4px 0">Batch Move Results</h3>';
  html += '<p style="color:#2e7d32">✅ Moved: ' + moved.length + ' row(s)</p>';
  if (skips.length) {
    html += '<p style="color:#b26a00">⚠️ Skipped: ' + skips.length + '</p><ul style="margin:4px 0;padding-left:18px">';
    for (var i = 0; i < skips.length; i++) {
      html += '<li>' + _esc_(skips[i].rowId) + ' — ' + _esc_(skips[i].reason) + '</li>';
    }
    html += '</ul><p style="color:#6b7280">Skipped rows are highlighted and noted in Internal Notes.</p>';
  }
  html += '</div>';
  try {
    SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(html).setTitle('Batch Move Results'));
  } catch (e) {
    safeToast_('Moved ' + moved.length + ', skipped ' + skips.length + '.', 'Surge Finance', 7);
  }
}

function _esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------ C3: safe delete ------------------------------ */
function menuDeleteExpense() {
  var sh = _requireActiveSheet_(SHEETS.EXPENSES, 'the Expenses sheet');
  if (!sh) { return; }
  var row = sh.getActiveCell().getRow();
  if (row < 2) { safeToast_('Select the expense row to delete.', 'Surge Finance', 4); return; }

  var d = sh.getRange(row, 1, 1, COLS.EXP.WIDTH).getValues()[0];
  var rowId = d[COLS.EXP.ROW_ID - 1];
  var amount = parseAmount(d[COLS.EXP.VERIFIED_AMOUNT - 1]);
  var crNum = String(d[COLS.EXP.CR_NUMBER - 1] || '').trim();

  var msg;
  if (crNum) {
    var crRow = findRowByValue_(SHEETS.CR_TRACKER, COLS.CR.CR_NUMBER, crNum);
    var curTotal = crRow ? parseAmount(getSheet_(SHEETS.CR_TRACKER).getRange(crRow, COLS.CR.TOTAL_AMOUNT).getValue()) : 0;
    msg = 'This expense (' + formatCAD(amount) + ') is linked to ' + crNum +
      '. Deleting it will reduce the CR total from ' + formatCAD(curTotal) + ' to ' +
      formatCAD(curTotal - amount) + '. Continue?';
  } else {
    msg = 'Delete this expense record (' + formatCAD(amount) + ')? This cannot be undone.';
  }
  if (!_confirm_('Delete Expense', msg)) { return; }

  withLock(function () {
    sh.deleteRow(row);
    if (crNum) { try { recalcCR(crNum); } catch (e) {} }
    logToAudit('ROW_DELETED', { sheet: SHEETS.EXPENSES, recordId: rowId,
      newValue: formatCAD(amount) + (crNum ? ' (was linked to ' + crNum + ')' : '') });
    safeToast_('Deleted ' + rowId + '.', 'Surge Finance', 4);
    try { notifyRevalidate_('dashboard'); } catch (e2) {}
  });
}
