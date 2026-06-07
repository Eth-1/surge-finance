/**
 * ============================================================================
 * TimeDriven.gs — trigger installer + scheduled jobs (§3.9, §6.1)
 * ============================================================================
 * installTriggers() wires the installable triggers (form submit, edit, change)
 * and the time-driven jobs. scheduledRecalc() runs every 5 min (§6.1 Layer 1);
 * dailyScheduledChecks() runs once daily. Each sub-job is independently
 * try-catch'd so one failure never aborts the rest. ES5-compatible.
 * ============================================================================
 */

/** (Re)install all triggers. Run once after deployment; safe to re-run. */
function installTriggers() {
  var ss = getSs_();
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) { ScriptApp.deleteTrigger(existing[i]); }

  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();   // installable (UrlFetch-capable)
  ScriptApp.newTrigger('onChange').forSpreadsheet(ss).onChange().create();

  ScriptApp.newTrigger('scheduledRecalc').timeBased().everyMinutes(5).create();          // §6.1 Layer 1
  ScriptApp.newTrigger('dailyScheduledChecks').timeBased().atHour(9).everyDays(1).create();

  safeToast_('Triggers installed (form/edit/change + 5-min recalc + daily checks).', 'Surge Finance', 6);
  logToAudit('STATUS_CHANGE', { sheet: 'System', newValue: 'installTriggers() completed' });
}

/* ------------------------------------------------------------------ *
 * 5-minute recompute cycle (§6.1).                                    *
 * ------------------------------------------------------------------ */
function scheduledRecalc() {
  _safeRun_('recalculateBudgetSpending', recalculateBudgetSpending);
  _safeRun_('recalculateGrantUtilization', recalculateGrantUtilization);
  _safeRun_('recalculateReconciliation', recalculateReconciliation);
  _safeRun_('generatePaymentDistribution', generatePaymentDistribution);
  _safeRun_('refreshExpenseFollowUpFlags', refreshExpenseFollowUpFlags);
  _safeRun_('refreshCRFollowUpFlags', refreshCRFollowUpFlags);
  _safeRun_('refreshDashboardData', function () {
    if (typeof refreshDashboardData === 'function') { refreshDashboardData(); }
  });
}

/* ------------------------------------------------------------------ *
 * Daily checks (§3.9): receipt validation, audit cleanup, ages, FY.   *
 * ------------------------------------------------------------------ */
function dailyScheduledChecks() {
  _safeRun_('validateReceiptLinks', validateReceiptLinks);
  _safeRun_('cleanOldAuditEntries', cleanOldAuditEntries);
  _safeRun_('refreshAllReceiptAges', refreshAllReceiptAges_);
  _safeRun_('refreshAllExpenseFiscalYears', refreshAllExpenseFiscalYears_);
  _safeRun_('scheduledRecalc', scheduledRecalc);   // also refresh aggregates daily
}

function _safeRun_(label, fn) {
  try { fn(); } catch (e) { logError({ sheet: 'System', message: 'scheduled ' + label + ': ' + e.message }); }
}

/* ------------------------------------------------------------------ *
 * Follow-up flag refreshers (flag only — never status, §3.9).         *
 * ------------------------------------------------------------------ */
function refreshExpenseFollowUpFlags() {
  var sh = getSheet_(SHEETS.EXPENSES);
  var last = sh.getLastRow();
  for (var r = 2; r <= last; r++) { refreshExpenseFollowUpFlag_(sh, r); }
}

function refreshCRFollowUpFlags() {
  var sh = getSheet_(SHEETS.CR_TRACKER);
  var last = sh.getLastRow();
  for (var r = 2; r <= last; r++) { refreshCRFollowUpFlag_(sh, r); }
}

/** CR Follow-Up Flag (col N) for one row (§5.11). Flag only. */
function refreshCRFollowUpFlag_(sh, row) {
  var cfg = getCfg();
  var status = String(sh.getRange(row, COLS.CR.STATUS).getValue() || '').trim();
  var ref = toDate_(sh.getRange(row, COLS.CR.DATE_SUBMITTED).getValue())
    || toDate_(sh.getRange(row, COLS.CR.DATE_CREATED).getValue());
  var flag = '';
  if (ref) {
    if (status === 'Draft') {
      var d = daysSince(ref);
      if (d > 14) { flag = '📝 Draft for ' + d + ' days — submit or cancel?'; }
    } else if (status === 'Submitted' || status === 'Follow Up' || status === 'Action Required') {
      var w = weeksSince(ref);
      if (w >= cfg.crFollowUpEscalationWeeks) { flag = '🔴 URGENT: ' + w + ' weeks since submission'; }
      else if (w >= cfg.crFollowUpWeeks) { flag = '🟡 FOLLOW UP: ' + w + ' weeks since submission'; }
    }
  }
  sh.getRange(row, COLS.CR.FOLLOWUP_FLAG).setValue(flag);
}

/* ------------------------------------------------------------------ *
 * Daily: AQ Receipt Age + Expenses Fiscal Year recompute (F7).        *
 * ------------------------------------------------------------------ */
function refreshAllReceiptAges_() {
  var sh = getSheet_(SHEETS.APPROVAL_QUEUE);
  var last = sh.getLastRow();
  for (var r = 2; r <= last; r++) { refreshReceiptAge_(sh, r); }
}

function refreshAllExpenseFiscalYears_() {
  var sh = getSheet_(SHEETS.EXPENSES);
  var last = sh.getLastRow();
  if (last < 2) { return; }
  var dates = sh.getRange(2, COLS.EXP.PURCHASE_DATE, last - 1, 1).getValues();
  var out = [];
  for (var i = 0; i < dates.length; i++) {
    var d = toDate_(dates[i][0]);
    out.push([d ? fiscalYearForDate(d).label : '']);
  }
  sh.getRange(2, COLS.EXP.FISCAL_YEAR, out.length, 1).setValues(out);
}

/* ------------------------------------------------------------------ *
 * Audit retention cleanup (§5.16). Entries are appended chronologically *
 * so the oldest are at the top — delete the leading expired block.     *
 * ------------------------------------------------------------------ */
function cleanOldAuditEntries() {
  return withLock(function () {
    var sh = getSheet_(SHEETS.AUDIT_LOG);
    var last = sh.getLastRow();
    if (last < 2) { return; }
    var cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - getCfg().auditRetentionMonths);
    var stamps = sh.getRange(2, COLS.AUDIT.TIMESTAMP, last - 1, 1).getValues();
    var expired = 0;
    for (var i = 0; i < stamps.length; i++) {
      var d = new Date(String(stamps[i][0]));
      if (isNaN(d.getTime()) || d.getTime() >= cutoff.getTime()) { break; }   // first kept → stop
      expired++;
    }
    if (expired > 0) { sh.deleteRows(2, expired); }
  });
}

/* ------------------------------------------------------------------ *
 * Receipt link validation via Drive API by file ID (D5).              *
 * Flags broken/trashed receipts in the Audit Log. Returns broken IDs.  *
 * ------------------------------------------------------------------ */
function validateReceiptLinks() {
  var sh = getSheet_(SHEETS.EXPENSES);
  var last = sh.getLastRow();
  if (last < 2) { return []; }
  var broken = [];
  for (var r = 2; r <= last; r++) {
    var formula = sh.getRange(r, COLS.EXP.RECEIPT_FILE).getFormula();
    var url = formula || sh.getRange(r, COLS.EXP.RECEIPT_FILE).getValue();
    var fileId = extractDriveFileId(url);
    if (!fileId) { continue; }
    var rowId = sh.getRange(r, COLS.EXP.ROW_ID).getValue();
    try {
      var file = DriveApp.getFileById(fileId);
      if (file.isTrashed()) {
        broken.push(rowId);
        logFileError(rowId, 'Receipt file is trashed (id ' + fileId + ')');
      }
    } catch (e) {
      broken.push(rowId);
      logFileError(rowId, 'Receipt file not found / inaccessible (id ' + fileId + ')');
    }
  }
  return broken;
}
