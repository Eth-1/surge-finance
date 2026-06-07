/**
 * ============================================================================
 * Mileage.gs — mileage approval → Expenses, transactional (§2.5, §3.5 / F5)
 * ============================================================================
 * The move is build-in-memory → single write → verify → set Processed. After a
 * verified write, Processed is NEVER reset to false (that would create a
 * duplicate on retry). All paths run inside withLock (re-entrant).
 * ES5-compatible.
 * ============================================================================
 */

/* ------------------------------------------------------------------ *
 * 2.13 — onEdit handler: Status (col L) → Approved / Rejected (§3.5)  *
 * ------------------------------------------------------------------ */
function handleMileageEdit_(e, info) {
  if (!info.hasCol(COLS.MILEAGE.STATUS)) { return; }
  var sh = info.sheet;
  eachDataRow_(info, function (row) {
    var status = String(sh.getRange(row, COLS.MILEAGE.STATUS).getValue() || '').trim();
    if (status === 'Approved') {
      fillMileageReviewer_(sh, row);
      moveMileageToExpenses(row);
    } else if (status === 'Rejected') {
      fillMileageReviewer_(sh, row);
      var rowId = sh.getRange(row, COLS.MILEAGE.ROW_ID).getValue();
      logToAudit('REJECTION', { sheet: SHEETS.MILEAGE_APPROVALS, recordId: rowId,
        field: 'Status', newValue: 'Rejected' });
      try { notifyRevalidate_('submissions'); } catch (ex) {}
    }
  });
}

/** Auto-fill Reviewer (M) + Review Date (N) on approve/reject. */
function fillMileageReviewer_(sh, row) {
  sh.getRange(row, COLS.MILEAGE.REVIEWER).setValue(activeUserEmail_() || 'unknown@edit');
  sh.getRange(row, COLS.MILEAGE.REVIEW_DATE).setValue(new Date());
}

/* ------------------------------------------------------------------ *
 * Transactional move to Expenses (§2.5 / F5).                         *
 * ------------------------------------------------------------------ */
function moveMileageToExpenses(row) {
  return withLock(function () {
    var mil = getSheet_(SHEETS.MILEAGE_APPROVALS);

    // 1–2. Fresh Processed read inside the lock.
    var processed = mil.getRange(row, COLS.MILEAGE.PROCESSED).getValue();
    if (processed === true || String(processed).toLowerCase() === 'true') {
      safeToast_('Already processed — no duplicate created.', 'Surge Finance', 4);
      return { moved: false, reason: 'already-processed' };
    }

    // 3. Build the complete Expenses row in memory + validate.
    var m = mil.getRange(row, 1, 1, COLS.MILEAGE.WIDTH).getValues()[0];
    var rowId = m[COLS.MILEAGE.ROW_ID - 1];
    if (!rowId) {
      safeToast_('Cannot move mileage — missing Row ID.', 'Surge Finance', 5);
      return { moved: false, reason: 'no-row-id' };
    }
    var cfg = getCfg();
    var distance = parseAmount(m[COLS.MILEAGE.DISTANCE - 1]);   // 0 is valid
    var rate = parseAmount(m[COLS.MILEAGE.RATE - 1]);
    var payout = parseAmount(m[COLS.MILEAGE.PAYOUT - 1]);
    var purchaseDate = toDate_(m[COLS.MILEAGE.DATE_TRAVEL - 1]);
    var fy = fiscalYearForDate(purchaseDate || m[COLS.MILEAGE.TIMESTAMP - 1]).label;
    var fileFormula = mil.getRange(row, COLS.MILEAGE.FILE_LINK).getFormula();
    var fileCell = fileFormula ? fileFormula : m[COLS.MILEAGE.FILE_LINK - 1];
    var desc = 'Mileage: ' + distance + 'km @ ' + formatCAD(rate) + '/km';

    var exp = getSheet_(SHEETS.EXPENSES);
    var newRow = exp.getLastRow() + 1;
    var expArr = [
      rowId, m[COLS.MILEAGE.TIMESTAMP - 1], m[COLS.MILEAGE.FULL_NAME - 1], m[COLS.MILEAGE.EMAIL - 1],
      m[COLS.MILEAGE.EVENT - 1], purchaseDate, payout, 'Mileage Reimbursement', desc, 'Mileage',
      'N/A – Mileage', fileCell, 'Club Bank Account', '', 'Approved', '',
      'E-Transfer (from club account)', cfg.defaultPayee, _statusAgeFormula_(newRow), '', '',
      'Mileage', fy
    ];

    // 4. Single atomic write.
    exp.getRange(newRow, 1, 1, COLS.EXP.WIDTH).setValues([expArr]);

    // 5. Verify before touching Processed.
    if (String(exp.getRange(newRow, COLS.EXP.ROW_ID).getValue()) !== String(rowId)) {
      logError({ sheet: SHEETS.EXPENSES, recordId: rowId, message: 'mileage move verify failed at row ' + newRow });
      return { moved: false, reason: 'verify-failed' };   // nothing reliable written; Processed still false (safe)
    }

    // 6. Mark Processed=true IMMEDIATELY after a verified write — never reverted (F5).
    mil.getRange(row, COLS.MILEAGE.PROCESSED).setValue(true);

    // 7–9. Best-effort finalization; failures here are logged but never revert Processed.
    try {
      mil.getRange(row, COLS.MILEAGE.STATUS).setValue('Moved to Expenses');
      mil.getRange(row, 1, 1, COLS.MILEAGE.WIDTH).setBackground('#D4EDDA').setFontColor('#666666');
      logToAudit('MOVE_TO_EXPENSES', { sheet: SHEETS.EXPENSES, recordId: rowId,
        newValue: 'Mileage ' + formatCAD(payout) });
    } catch (finErr) {
      logError({ sheet: SHEETS.MILEAGE_APPROVALS, recordId: rowId,
        message: 'mileage post-append finalize failed (Expenses row IS present): ' + finErr.message });
    }

    try { notifyRevalidate_('dashboard'); } catch (e1) {}
    try { notifyRevalidate_('submissions'); } catch (e2) {}
    return { moved: true, rowId: rowId, expenseRow: newRow };
  });
}
