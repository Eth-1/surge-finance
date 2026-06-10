/**
 * ============================================================================
 * Archive.gs — Year-End checklist (§4.5b) + reliable archiving (§5.17 / D4)
 * ============================================================================
 * Archiving is opt-in (Enable Archiving=Y), Director-only, and copy-verify-then-
 * delete so a row is never deleted before its archived copy is confirmed.
 * computeYearEndChecklist_() is read-only and shared by the menu, the Web App
 * (/year-end), and the Vercel checklist. ES5-compatible.
 * ============================================================================
 */

/** Start year of the live-window cutoff: rows with FY start < this are archive-eligible. */
function _liveWindowStartYear_() {
  var currentStart = fiscalYearForDate(new Date()).startYear;
  return currentStart - (getCfg().keepLiveFiscalYears - 1);
}

/** Is an Expenses row (values array) archive-eligible (terminal + pre-live-window)? */
function _isArchiveEligible_(rowVals, liveStart) {
  var status = String(rowVals[COLS.EXP.REIMB_STATUS - 1] || '').trim();
  if (status !== 'Reimbursed' && status !== 'Rejected / Cancelled') { return false; }
  var pd = toDate_(rowVals[COLS.EXP.PURCHASE_DATE - 1]);
  if (!pd) { return false; }
  return fiscalYearForDate(pd).startYear < liveStart;
}

/* ------------------------------------------------------------------ *
 * Year-End Rollover checklist (§4.5b) — read-only.                    *
 * @return [{ item, count, ok, info }]                                  *
 * ------------------------------------------------------------------ */
function computeYearEndChecklist_() {
  var cfg = getCfg();
  var out = [];

  // CRs in terminal state (non-Distributed & non-Cancelled == 0).
  var cr = getSheet_(SHEETS.CR_TRACKER);
  var crActive = 0, crLast = cr.getLastRow();
  if (crLast >= 2) {
    var crStatuses = cr.getRange(2, COLS.CR.STATUS, crLast - 1, 1).getValues();
    for (var i = 0; i < crStatuses.length; i++) {
      var s = String(crStatuses[i][0] || '').trim();
      if (s && s !== 'Distributed' && s !== 'Cancelled') { crActive++; }
    }
  }
  out.push({ item: 'All CRs in terminal state', count: crActive, ok: crActive === 0 });

  // Outstanding reimbursements resolved.
  var recon = computeReconciliationSummary_();
  out.push({ item: 'Outstanding balance resolved', count: recon.unreimbursedCount,
    ok: recon.unreimbursedTotal === 0, info: formatCAD(recon.unreimbursedTotal) });

  // Grants resolved (no Applied/Under Review).
  var gr = getSheet_(SHEETS.GRANTS), grOpen = 0, grLast = gr.getLastRow();
  if (grLast >= 2) {
    var grS = gr.getRange(2, COLS.GRANT.STATUS, grLast - 1, 1).getValues();
    for (var g = 0; g < grS.length; g++) {
      var gs = String(grS[g][0] || '').trim();
      if (gs === 'Applied' || gs === 'Under Review') { grOpen++; }
    }
  }
  out.push({ item: 'All grants resolved', count: grOpen, ok: grOpen === 0 });

  // Budgets all closed.
  var bu = getSheet_(SHEETS.BUDGETS), buOpen = 0, buLast = bu.getLastRow();
  if (buLast >= 2) {
    var buS = bu.getRange(2, COLS.BUDGET.STATUS, buLast - 1, 1).getValues();
    for (var b = 0; b < buS.length; b++) {
      var bs = String(buS[b][0] || '').trim();
      if (bs && bs !== 'Closed') { buOpen++; }
    }
  }
  out.push({ item: 'All budgets closed', count: buOpen, ok: buOpen === 0 });

  // V3: member loans repaid (tolerates a pre-migration workbook with no Loans sheet).
  var loansOpen = 0;
  try {
    var loSheet = getSs_().getSheetByName(SHEETS.LOANS);
    if (loSheet && loSheet.getLastRow() >= 2) {
      var loData = loSheet.getRange(2, 1, loSheet.getLastRow() - 1, COLS.LOAN.WIDTH).getValues();
      for (var lo = 0; lo < loData.length; lo++) {
        var loLender = String(loData[lo][COLS.LOAN.LENDER - 1] || '').trim();
        if (!loLender && parseAmount(loData[lo][COLS.LOAN.AMOUNT - 1]) <= 0) { continue; }
        if (String(loData[lo][COLS.LOAN.STATUS - 1] || '').trim() !== 'Repaid') { loansOpen++; }
      }
    }
  } catch (loErr) {}
  out.push({ item: 'All member loans repaid', count: loansOpen, ok: loansOpen === 0 });

  // Pending AQ items cleared.
  out.push(_countStatus_(SHEETS.APPROVAL_QUEUE, COLS.AQ.APPROVAL_STATUS, 'Pending', 'Pending AQ items cleared'));
  // Pending mileage cleared.
  out.push(_countStatus_(SHEETS.MILEAGE_APPROVALS, COLS.MILEAGE.STATUS, 'Pending', 'Mileage approvals cleared'));

  // Prior-year records archived.
  if (cfg.enableArchiving) {
    var eligible = _countArchiveEligible_();
    out.push({ item: 'Prior-year records archived', count: eligible, ok: eligible === 0,
      info: eligible > 0 ? 'Run "Archive Prior Years"' : '' });
  } else {
    out.push({ item: 'Prior-year records archived', count: 0, ok: true, info: 'Archiving disabled' });
  }
  return out;
}

function _countStatus_(sheetName, col, value, label) {
  var sh = getSheet_(sheetName), n = 0, last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, col, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) { if (String(vals[i][0] || '').trim() === value) { n++; } }
  }
  return { item: label, count: n, ok: n === 0 };
}

function _countArchiveEligible_() {
  var exp = getSheet_(SHEETS.EXPENSES), last = exp.getLastRow();
  if (last < 2) { return 0; }
  var data = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
  var liveStart = _liveWindowStartYear_();
  var n = 0;
  for (var i = 0; i < data.length; i++) { if (_isArchiveEligible_(data[i], liveStart)) { n++; } }
  return n;
}

/* ------------------------------------------------------------------ *
 * Archive prior-year terminal records (§5.17) — Director-only, opt-in. *
 * Copy → verify → delete (bottom-to-top). Never lossy.                 *
 * ------------------------------------------------------------------ */
function archivePriorYears_() {
  return withLock(function () {
    if (!getCfg().enableArchiving) {
      safeToast_('Archiving is disabled (set Enable Archiving = Y in Settings).', 'Surge Finance', 6);
      return { ok: false, reason: 'disabled' };
    }
    if (!requireDirector_('Archive Prior Years')) { return { ok: false, reason: 'permission' }; }

    var exp = getSheet_(SHEETS.EXPENSES);
    var arch = getSheet_(SHEETS.ARCHIVE);
    var last = exp.getLastRow();
    if (last < 2) { return { ok: true, archived: 0 }; }

    var data = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
    var liveStart = _liveWindowStartYear_();
    var eligibleRows = [];
    for (var i = 0; i < data.length; i++) {
      if (_isArchiveEligible_(data[i], liveStart)) { eligibleRows.push(i + 2); }
    }
    if (!eligibleRows.length) { safeToast_('No archive-eligible rows (prior-FY terminal).', 'Surge Finance', 5); return { ok: true, archived: 0 }; }
    if (!_confirm_('Archive Prior Years', 'Archive ' + eligibleRows.length + ' fully-terminal row(s) from fiscal years before ' + liveStart + '? They move to the Archive sheet.')) {
      return { ok: false, reason: 'cancelled' };
    }

    var archived = 0, skipped = 0;
    // Bottom-to-top so deletions don't shift the rows we still need.
    eligibleRows.sort(function (a, b) { return b - a; });
    for (var k = 0; k < eligibleRows.length; k++) {
      var srcRow = eligibleRows[k];
      var vals = exp.getRange(srcRow, 1, 1, COLS.EXP.WIDTH).getValues()[0];
      var receiptFormula = exp.getRange(srcRow, COLS.EXP.RECEIPT_FILE).getFormula();
      if (receiptFormula) { vals[COLS.EXP.RECEIPT_FILE - 1] = receiptFormula; }
      var rowId = vals[COLS.EXP.ROW_ID - 1];
      var archRow = arch.getLastRow() + 1;
      arch.getRange(archRow, 1, 1, COLS.EXP.WIDTH).setValues([vals]);
      if (String(arch.getRange(archRow, COLS.EXP.ROW_ID).getValue()) === String(rowId)) {
        exp.deleteRow(srcRow);                      // delete ONLY after verified copy
        logToAudit('ARCHIVE', { sheet: SHEETS.ARCHIVE, recordId: rowId, newValue: vals[COLS.EXP.FISCAL_YEAR - 1] });
        archived++;
      } else {
        skipped++;
        logError({ sheet: SHEETS.ARCHIVE, recordId: rowId, message: 'archive verify failed — source left in place' });
      }
    }
    safeToast_('Archived ' + archived + ' row(s).' + (skipped ? ' ' + skipped + ' skipped (verify failed).' : ''), 'Surge Finance', 8);
    try { notifyRevalidate_('year-end'); } catch (e) {}
    return { ok: true, archived: archived, skipped: skipped };
  });
}
