/**
 * ============================================================================
 * Reconciliation.gs — §1 CR reconciliation + §2 payment distribution (§5.13)
 * ============================================================================
 * recalculateReconciliation() rebuilds §1 (rows 3–19) for every non-Cancelled
 * CR (F11), preserving the manual columns (Actual / Supplementary / Notes) and
 * writing live Discrepancy/Total-Available formulas + script Coverage/
 * Distributed flags. generatePaymentDistribution() idempotently appends §2 rows
 * (rows 22+) for reimbursed/received expenses, matched by Row-ID set (F10).
 * ES5-compatible.
 * ============================================================================
 */

var RECON_S1_MAX_ROWS = 17;   // rows 3..19 before §2 begins at row 20

/** True if the CR has ≥1 linked expense and ALL linked expenses are Reimbursed. */
function _allLinkedReimbursed_(crNum, expData) {
  var seen = 0;
  for (var i = 0; i < expData.length; i++) {
    if (String(expData[i][COLS.EXP.CR_NUMBER - 1] || '').trim() === String(crNum)) {
      seen++;
      if (String(expData[i][COLS.EXP.REIMB_STATUS - 1] || '').trim() !== 'Reimbursed') { return false; }
    }
  }
  return seen > 0;
}

/* ------------------------------------------------------------------ *
 * §1 — CR reconciliation recompute (script; preserves manual cols).   *
 * ------------------------------------------------------------------ */
function recalculateReconciliation() {
  return withLock(function () {
    var sh = getSheet_(SHEETS.RECONCILIATION);
    var cr = getSheet_(SHEETS.CR_TRACKER);
    var exp = getSheet_(SHEETS.EXPENSES);

    // Preserve existing manual columns (E Actual, F Supp Source, G Supp Amount, M Notes).
    var existing = {};
    var lastData = Math.min(sh.getLastRow(), COLS.RECON.S1_DATA_ROW + RECON_S1_MAX_ROWS - 1);
    if (lastData >= COLS.RECON.S1_DATA_ROW) {
      var prev = sh.getRange(COLS.RECON.S1_DATA_ROW, 1, lastData - COLS.RECON.S1_DATA_ROW + 1, COLS.RECON.S1_WIDTH).getValues();
      for (var i = 0; i < prev.length; i++) {
        var k = String(prev[i][COLS.RECON.S1_CR_NUMBER - 1] || '').trim();
        if (k) {
          existing[k] = { actual: prev[i][COLS.RECON.S1_ACTUAL - 1], suppSrc: prev[i][COLS.RECON.S1_SUPP_SOURCE - 1],
            suppAmt: prev[i][COLS.RECON.S1_SUPP_AMOUNT - 1], notes: prev[i][COLS.RECON.S1_NOTES - 1] };
        }
      }
    }

    var crLast = cr.getLastRow();
    var crData = (crLast >= 2) ? cr.getRange(2, 1, crLast - 1, COLS.CR.FIXED_WIDTH).getValues() : [];
    var expLast = exp.getLastRow();
    var expData = (expLast >= 2) ? exp.getRange(2, 1, expLast - 1, COLS.EXP.WIDTH).getValues() : [];

    var out = [];
    for (var c = 0; c < crData.length && out.length < RECON_S1_MAX_ROWS; c++) {
      var status = String(crData[c][COLS.CR.STATUS - 1] || '').trim();
      if (status === 'Cancelled') { continue; }   // F11
      var crNum = String(crData[c][COLS.CR.CR_NUMBER - 1] || '').trim();
      if (!crNum) { continue; }
      var expected = parseAmount(crData[c][COLS.CR.TOTAL_AMOUNT - 1]);
      var received = (status === 'Cheque Received' || status === 'Distributed') ? 'Y' : 'N';
      var dateReceived = crData[c][COLS.CR.DATE_CHEQUE_RECEIVED - 1];

      var ex = existing[crNum] || {};
      var actual = ex.actual;
      if ((actual === '' || actual == null) && received === 'Y') { actual = expected; }   // default on receipt
      var actualNum = parseAmount(actual);
      var suppAmt = parseAmount(ex.suppAmt);
      var totalAvail = actualNum + suppAmt;
      var coverage = (Math.abs(totalAvail - expected) <= 0.01) ? '✅ Fully Covered'
        : '⚠️ Shortfall: ' + formatCAD(expected - totalAvail);
      var distributed = (received === 'Y' && _allLinkedReimbursed_(crNum, expData)) ? 'Y' : 'N';
      var r = COLS.RECON.S1_DATA_ROW + out.length;

      out.push([
        crNum, expected, received, dateReceived,
        (actual === '' || actual == null) ? '' : actualNum,
        ex.suppSrc || '', (ex.suppAmt === '' || ex.suppAmt == null) ? '' : suppAmt,
        '=E' + r + '-B' + r,                                   // H Discrepancy (live)
        '=IF(ABS(H' + r + ')>0.01,"⚠️ Mismatch","✅ Match")',   // I Discrepancy Flag (live)
        '=E' + r + '+G' + r,                                   // J Total Available (live)
        coverage,                                              // K Coverage Flag (script)
        distributed,                                           // L Distributed? (script)
        ex.notes || ''                                         // M Notes (manual)
      ]);
    }

    if (out.length) {
      sh.getRange(COLS.RECON.S1_DATA_ROW, 1, out.length, COLS.RECON.S1_WIDTH).setValues(out);
    }
    // Clear any leftover rows from removed/cancelled CRs (up to the §2 boundary).
    var clearFrom = COLS.RECON.S1_DATA_ROW + out.length;
    var clearTo = COLS.RECON.S1_DATA_ROW + RECON_S1_MAX_ROWS - 1;
    if (clearTo >= clearFrom) {
      sh.getRange(clearFrom, 1, clearTo - clearFrom + 1, COLS.RECON.S1_WIDTH).clearContent();
    }
  });
}

/* ------------------------------------------------------------------ *
 * §2 — Payment distribution auto-gen (idempotent, F10).               *
 * ------------------------------------------------------------------ */
function generatePaymentDistribution() {
  return withLock(function () {
    var sh = getSheet_(SHEETS.RECONCILIATION);
    var exp = getSheet_(SHEETS.EXPENSES);
    var start = COLS.RECON.S2_DATA_ROW;

    // Existing §2 rows → map Row-ID → sheet row (idempotency by exact ID set).
    var seen = {};
    var last = sh.getLastRow();
    var nextRow = start;
    if (last >= start) {
      var s2 = sh.getRange(start, 1, last - start + 1, COLS.RECON.S2_WIDTH).getValues();
      for (var i = 0; i < s2.length; i++) {
        var id = String(s2[i][COLS.RECON.S2_LINKED_IDS - 1] || '').trim();
        if (id) { seen[id] = start + i; }
      }
      nextRow = start + s2.length;
    }

    var expLast = exp.getLastRow();
    if (expLast < 2) { return; }
    var data = exp.getRange(2, 1, expLast - 1, COLS.EXP.WIDTH).getValues();
    var appended = 0;
    for (var j = 0; j < data.length; j++) {
      var status = String(data[j][COLS.EXP.REIMB_STATUS - 1] || '').trim();
      if (status !== 'Reimbursed' && status !== 'Payment Received') { continue; }
      var rowId = String(data[j][COLS.EXP.ROW_ID - 1] || '').trim();
      if (!rowId) { continue; }
      var reconciled = (status === 'Reimbursed') ? 'Y' : 'N';

      if (seen[rowId]) {
        sh.getRange(seen[rowId], COLS.RECON.S2_RECONCILED).setValue(reconciled);   // refresh flag
        continue;
      }
      var crNum = String(data[j][COLS.EXP.CR_NUMBER - 1] || '').trim() || 'Direct';
      sh.getRange(nextRow, 1, 1, COLS.RECON.S2_WIDTH).setValues([[
        crNum, data[j][COLS.EXP.FULL_NAME - 1], parseAmount(data[j][COLS.EXP.VERIFIED_AMOUNT - 1]),
        data[j][COLS.EXP.PAYMENT_DATE - 1], data[j][COLS.EXP.PAYMENT_METHOD - 1], rowId, reconciled, ''
      ]]);
      nextRow++;
      appended++;
    }
    if (appended) { try { notifyRevalidate_('dashboard'); } catch (e) {} }
  });
}

/* ------------------------------------------------------------------ *
 * Reconciliation summary KPIs (§5.13) — read-only, for dashboard.     *
 * ------------------------------------------------------------------ */
function computeReconciliationSummary_() {
  var cr = getSheet_(SHEETS.CR_TRACKER);
  var exp = getSheet_(SHEETS.EXPENSES);
  var s = { totalCRs: 0, crsReceived: 0, crsDistributed: 0, crsPending: 0,
    totalExpected: 0, totalReceived: 0, unreimbursedTotal: 0, unreimbursedCount: 0 };

  var crLast = cr.getLastRow();
  if (crLast >= 2) {
    var crData = cr.getRange(2, 1, crLast - 1, COLS.CR.FIXED_WIDTH).getValues();
    var pending = { 'Submitted': 1, 'Follow Up': 1, 'Action Required': 1, 'Approved by SFSS': 1 };
    var received = { 'Cheque Received': 1, 'Distributed': 1 };
    for (var i = 0; i < crData.length; i++) {
      var st = String(crData[i][COLS.CR.STATUS - 1] || '').trim();
      if (st === 'Cancelled' || !String(crData[i][COLS.CR.CR_NUMBER - 1] || '').trim()) { continue; }
      s.totalCRs++;
      var amt = parseAmount(crData[i][COLS.CR.TOTAL_AMOUNT - 1]);
      s.totalExpected += amt;
      if (received[st]) { s.crsReceived++; s.totalReceived += amt; }
      if (st === 'Distributed') { s.crsDistributed++; }
      if (pending[st]) { s.crsPending++; }
    }
  }

  var expLast = exp.getLastRow();
  if (expLast >= 2) {
    var expData = exp.getRange(2, 1, expLast - 1, COLS.EXP.WIDTH).getValues();
    for (var j = 0; j < expData.length; j++) {
      var es = String(expData[j][COLS.EXP.REIMB_STATUS - 1] || '').trim();
      if (es !== 'Reimbursed' && es !== 'Rejected / Cancelled') {
        s.unreimbursedTotal += parseAmount(expData[j][COLS.EXP.VERIFIED_AMOUNT - 1]);
        s.unreimbursedCount++;
      }
    }
  }
  s.totalExpected = roundMoney(s.totalExpected);
  s.totalReceived = roundMoney(s.totalReceived);
  s.unreimbursedTotal = roundMoney(s.unreimbursedTotal);
  return s;
}
