/**
 * ============================================================================
 * Forms.gs — onFormSubmit handlers (receipt §3.3 / mileage §3.5)
 * ============================================================================
 * Called from Triggers.onFormSubmit INSIDE withLock. Each handler appends one
 * row to the relevant intake sheet, sets per-row formulas/computed cells, runs
 * best-effort file operations (try-catch, never blocking), and audits.
 * ES5-compatible.
 * ============================================================================
 */

/** Read a form field by exact field name, falling back to positional e.values. */
function getFormVal_(e, name, idx) {
  if (e && e.namedValues && e.namedValues[name] && e.namedValues[name].length) {
    return e.namedValues[name][0];
  }
  if (e && e.values && typeof idx === 'number' && idx < e.values.length) {
    return e.values[idx];
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * 2.6 — Receipt reimbursement form → Approval Queue (Pending)         *
 * ------------------------------------------------------------------ */
function handleReceiptFormSubmit_(e) {
  var sh = getSheet_(SHEETS.APPROVAL_QUEUE);
  var cfg = getCfg();

  var rowId = generateRowId();
  var ts = toDate_(getFormVal_(e, 'Timestamp', 0)) || new Date();
  var fullName = getFormVal_(e, 'Full Name', 1);
  var email = getFormVal_(e, 'Email Address for Interac e-Transfer Reimbursement', 2);
  var event = getFormVal_(e, 'Event / Project Name', 3);
  var purchaseDate = toDate_(getFormVal_(e, 'Date of Purchase (as shown on receipt)', 4));
  var amount = parseAmount(getFormVal_(e, 'Amount Paid (CAD) (no $ symbol)', 5));
  var vendor = getFormVal_(e, 'Vendor / Store Name', 6);
  var description = getFormVal_(e, 'Describe the Expense (what and why?)', 7);
  var preApproved = getFormVal_(e, 'Was this pre-approved or part of a planned purchase?', 8);
  var receiptUrl = getFormVal_(e, 'Upload Receipt (PDF or Image)', 9);
  var notes = getFormVal_(e, 'Additional Notes (Optional)', 10);

  var newRow = sh.getLastRow() + 1;

  // Receipt age (§5.7): "⚠️ {n} days old" if older than threshold, else "{n} days".
  var ageText = '';
  if (purchaseDate) {
    var n = Math.max(0, daysSince(purchaseDate));
    ageText = (n > cfg.receiptAgeThresholdDays) ? ('⚠️ ' + n + ' days old') : (n + ' days');
  }

  // Auto-approve (§3.3e / §5.5) — disabled by default.
  var coordVal = '', dirVal = '', statusVal = 'Pending', projectVal = '';
  var doAutoMove = false;
  if (cfg.autoApproveEnabled && cfg.autoApproveThreshold > 0 && amount <= cfg.autoApproveThreshold) {
    var coordNames = getListValues('CoordinatorNames');
    var dirNames = getListValues('DirectorNames');
    if (coordNames.length && dirNames.length) {
      coordVal = coordNames[0];
      dirVal = dirNames[0];
      statusVal = 'Fully Approved';
      projectVal = event;   // best-effort project so the move has a chance (Category still required)
      doAutoMove = true;
    }
  }

  var dupFormula = '=IF(AND(COUNTIFS(G:G,G' + newRow + ',H:H,H' + newRow +
    ',F:F,F' + newRow + ')>1,ROW()>1),"⚠️ DUPLICATE","")';

  var rowArr = [
    rowId, ts, fullName, email, event, purchaseDate, amount, vendor, description,
    preApproved, buildHyperlink(receiptUrl, '📎 View Receipt'), notes,
    dupFormula, ageText, coordVal, dirVal, statusVal, projectVal, '', '', '', '', '', new Date()
  ];
  sh.getRange(newRow, 1, 1, COLS.AQ.WIDTH).setValues([rowArr]);

  // Best-effort file rename/move (§3.3f) — failure logged, never blocks submission.
  var fileId = extractDriveFileId(receiptUrl);
  if (fileId) {
    try {
      organizeNewReceipt_(fileId, {
        purchaseDate: purchaseDate, vendor: vendor, fullName: fullName, rowId: rowId,
        fyLabel: fiscalYearForDate(purchaseDate || ts).label, project: event
      });
    } catch (fileErr) {
      logFileError(rowId, 'FILE_OPERATION (submit): ' + fileErr.message);
    }
  }

  logToAudit('FORM_SUBMISSION', { sheet: SHEETS.APPROVAL_QUEUE, recordId: rowId, submitterEmail: email });

  if (doAutoMove) {
    logToAudit('AUTO_APPROVE', {
      sheet: SHEETS.APPROVAL_QUEUE, recordId: rowId,
      newValue: formatCAD(amount) + ' ≤ threshold ' + formatCAD(cfg.autoApproveThreshold)
    });
    // moveRowToExpenses validates Project+Category (E3). If Category is blank the move
    // is skipped (row stays Fully Approved for finance to complete) — see §2.10.
    try { moveRowToExpenses(newRow, { silent: true }); } catch (mvErr) {
      logError({ sheet: SHEETS.APPROVAL_QUEUE, recordId: rowId, message: 'auto-move: ' + mvErr.message });
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2.7 — Mileage reimbursement form → Mileage Approvals (Pending)      *
 * ------------------------------------------------------------------ */
function handleMileageFormSubmit_(e) {
  var sh = getSheet_(SHEETS.MILEAGE_APPROVALS);
  var cfg = getCfg();

  var rowId = generateRowId();
  var ts = toDate_(getFormVal_(e, 'Timestamp', 0)) || new Date();
  var fullName = getFormVal_(e, 'Full Name', 1);
  var email = getFormVal_(e, 'Email Address for Interac e-Transfer Reimbursement', 2);
  var event = getFormVal_(e, 'Event / Project Name', 3);
  var dateTravel = toDate_(getFormVal_(e, 'Date of Travel', 4));
  var distance = parseAmount(getFormVal_(e, 'Distance Traveled (km)', 5));   // 0 allowed
  var rateType = String(getFormVal_(e, 'Reimbursement Rate', 6) || '');
  var customRate = parseAmount(getFormVal_(e, 'Custom Rate ($/km)', 7));
  var docUrl = getFormVal_(e, 'Upload Supporting Document (Optional)', 8);
  var notes = getFormVal_(e, 'Additional Notes (Optional)', 9);

  // Rate selection (§5.1): custom only when explicitly chosen AND positive; else standard (F9).
  var rateApplied = (rateType.toLowerCase().indexOf('custom') > -1 && customRate > 0)
    ? customRate : cfg.mileageStandardRate;
  var payout = roundMoney(distance * rateApplied);

  var newRow = sh.getLastRow() + 1;
  var rowArr = [
    rowId, ts, fullName, email, event, dateTravel, distance, rateApplied, payout,
    buildHyperlink(docUrl, '📎 View Document'), notes, 'Pending', '', '', '', false
  ];
  sh.getRange(newRow, 1, 1, COLS.MILEAGE.WIDTH).setValues([rowArr]);

  logToAudit('FORM_SUBMISSION', { sheet: SHEETS.MILEAGE_APPROVALS, recordId: rowId, submitterEmail: email });
}
