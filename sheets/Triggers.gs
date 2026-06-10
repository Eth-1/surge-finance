/**
 * ============================================================================
 * Triggers.gs — onOpen / onFormSubmit / onEdit / onChange dispatchers
 * ============================================================================
 * Thin routing layer. Per-sheet handlers live in their domain files
 * (ApprovalQueue.gs, Expenses.gs, CRTracker.gs, Mileage.gs, Settings.gs).
 * All mutating routes run inside withLock() (§3.3g). onEdit is RANGE-AWARE so a
 * bulk copy-paste (one onEdit with a multi-cell range) recalculates every
 * pasted row (§3.3h / F3).
 *
 * Trigger wiring: onFormSubmit / onEdit (installable) / onChange are installed
 * by installTriggers() in TimeDriven.gs. onOpen is a simple trigger.
 * ES5-compatible.
 * ============================================================================
 */

/* ------------------------------------------------------------------ *
 * onOpen — build the custom menu (simple trigger).                    *
 * ------------------------------------------------------------------ */
function onOpen(e) {
  try { buildSurgeMenu_(); } catch (err) { Logger.log('onOpen failed: ' + err.message); }
}

/* ------------------------------------------------------------------ *
 * onFormSubmit — route by which Form Responses sheet received the row. *
 * ------------------------------------------------------------------ */
function onFormSubmit(e) {
  try {
    var sheetName = (e && e.range) ? e.range.getSheet().getName() : '';
    withLock(function () {
      if (sheetName === SHEETS.MILEAGE_RESPONSES) {
        handleMileageFormSubmit_(e);
      } else {
        // Default to the receipt form (covers FORM_RESPONSES and Form-trigger events).
        handleReceiptFormSubmit_(e);
      }
    });
  } catch (err) {
    logError({ sheet: 'Form', message: 'onFormSubmit: ' + err.message });
  }
}

/* ------------------------------------------------------------------ *
 * onSheetEdit — range-aware dispatcher (F3).                          *
 * Bound as an INSTALLABLE onEdit trigger (not the reserved simple     *
 * onEdit name) so it can call UrlFetchApp (revalidate webhook, D1)    *
 * and Session user APIs, and so it never double-fires.                *
 * ------------------------------------------------------------------ */
function onSheetEdit(e) {
  if (!e || !e.range) { return; }
  var info = rangeInfo_(e);
  if (info.endRow < 2 && info.name !== SHEETS.SETTINGS) { return; }  // header-only edit

  try {
    switch (info.name) {
      case SHEETS.APPROVAL_QUEUE:
        bigPasteToast_(info);
        withLock(function () { handleApprovalQueueEdit_(e, info); });
        break;
      case SHEETS.EXPENSES:
        bigPasteToast_(info);
        withLock(function () { handleExpensesEdit_(e, info); });
        break;
      case SHEETS.CR_TRACKER:
        withLock(function () { handleCRTrackerEdit_(e, info); });
        break;
      case SHEETS.MILEAGE_APPROVALS:
        withLock(function () { handleMileageEdit_(e, info); });
        break;
      case SHEETS.SETTINGS:
        withLock(function () { handleSettingsEdit_(e, info); });
        break;
      case SHEETS.LOANS:
        withLock(function () { handleLoansEdit_(e, info); });
        break;
      default:
        break;   // other sheets: no onEdit behavior
    }
  } catch (err) {
    logError({ sheet: info.name, message: 'onEdit: ' + err.message });
    safeToast_('An error occurred — see Audit Log. (' + err.message + ')', 'Surge Finance', 6);
  }
}

/* ------------------------------------------------------------------ *
 * onChange — Expenses row-deletion safety net (C3).                   *
 * onChange cannot supply deleted row data, so the rich confirmation +  *
 * per-row recalc happens in the menu Delete action; this is a backstop *
 * that recomputes all CR totals after any Expenses row removal.        *
 * ------------------------------------------------------------------ */
function onChange(e) {
  if (!e || e.changeType !== 'REMOVE_ROW') { return; }
  try {
    var active = e.source ? e.source.getActiveSheet() : null;
    if (active && active.getName() === SHEETS.EXPENSES) {
      withLock(function () { handleExpensesRowChange_(); });
    }
  } catch (err) {
    logError({ sheet: SHEETS.EXPENSES, message: 'onChange: ' + err.message });
  }
}

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */

/** Normalize an edit event range into row/col bounds + a column-membership test. */
function rangeInfo_(e) {
  var sheet = e.range.getSheet();
  var startRow = e.range.getRow();
  var startCol = e.range.getColumn();
  var numRows = e.range.getNumRows();
  var numCols = e.range.getNumColumns();
  return {
    sheet: sheet,
    name: sheet.getName(),
    startRow: startRow,
    endRow: startRow + numRows - 1,
    startCol: startCol,
    endCol: startCol + numCols - 1,
    numRows: numRows,
    numCols: numCols,
    /** True if 1-based column c is within the edited range. */
    hasCol: function (c) { return c >= startCol && c <= startCol + numCols - 1; }
  };
}

/** For 500+ row pastes, surface a progress toast before the locked batch (§3.3h). */
function bigPasteToast_(info) {
  if (info.numRows >= 500) {
    safeToast_('Recalculating ' + info.numRows + ' rows…', 'Surge Finance', 8);
  }
}

/** Iterate data rows in an edit range (clamped to row ≥ 2). */
function eachDataRow_(info, fn) {
  var start = Math.max(info.startRow, 2);
  for (var r = start; r <= info.endRow; r++) { fn(r); }
}
