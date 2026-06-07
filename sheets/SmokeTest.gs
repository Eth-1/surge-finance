/**
 * ============================================================================
 * SmokeTest.gs — end-to-end happy-path test (§5.3)
 * ============================================================================
 * Run smokeTest() from the Apps Script editor AFTER buildAll(). It exercises:
 *   receipt submit → approve → move to Expenses → create CR → status cascade →
 *   reconciliation + payment distribution, asserting each step. Run
 *   smokeTestCleanup() afterwards to remove the test rows.
 * ES5-compatible.
 * ============================================================================
 */

var SMOKE_EMAIL = "smoketest@sfu.ca";

function smokeTest() {
  var log = [];
  function ok(cond, msg) { log.push((cond ? "✅ " : "❌ ") + msg); }

  withLock(function () {
    var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
    var exp = getSheet_(SHEETS.EXPENSES);
    var before = aq.getLastRow();

    // 1. Receipt form submission → AQ.
    handleReceiptFormSubmit_({
      namedValues: {
        "Full Name": ["Smoke Test"],
        "Email Address for Interac e-Transfer Reimbursement": [SMOKE_EMAIL],
        "Event / Project Name": ["StormHacks 2026"],
        "Date of Purchase (as shown on receipt)": ["2026-01-15"],
        "Amount Paid (CAD) (no $ symbol)": ["100"],
        "Vendor / Store Name": ["Smoke Vendor"],
        "Describe the Expense (what and why?)": ["Smoke test expense"],
        "Was this pre-approved or part of a planned purchase?": ["Yes – pre-approved"],
        "Upload Receipt (PDF or Image)": [""],
        "Additional Notes (Optional)": [""],
      },
    });
    var row = aq.getLastRow();
    ok(row > before, "Receipt added to Approval Queue (row " + row + ")");
    var rowId = aq.getRange(row, COLS.AQ.ROW_ID).getValue();

    // 2. Approve (coord + dir) + assign project/category → Fully Approved.
    var coords = getListValues("CoordinatorNames");
    var dirs = getListValues("DirectorNames");
    aq.getRange(row, COLS.AQ.COORD_APPROVAL).setValue(coords[0] || "Finance Coordinator");
    aq.getRange(row, COLS.AQ.DIR_APPROVAL).setValue(dirs[0] || "Finance Director");
    aq.getRange(row, COLS.AQ.STD_PROJECT).setValue("StormHacks 2026");
    aq.getRange(row, COLS.AQ.CATEGORY).setValue("Marketing");
    recalculateApprovalStatus(row);
    ok(String(aq.getRange(row, COLS.AQ.APPROVAL_STATUS).getValue()) === "Fully Approved", "AQ → Fully Approved");

    // 3. Move to Expenses.
    var res = moveRowToExpenses(row, { silent: true });
    ok(res && res.moved, "Moved to Expenses");
    var expRow = res.expenseRow;

    // 4. Create CR.
    var crRes = createChequeRequisition([expRow]);
    ok(crRes && crRes.ok, "CR created: " + (crRes && crRes.crNumber));
    var crNum = crRes.crNumber;
    ok(String(exp.getRange(expRow, COLS.EXP.REIMB_STATUS).getValue()) === "CR Draft", "Expense → CR Draft");

    // 5. Funding allocation (so the E5 gate passes) + status cascade.
    var crRow = findRowByValue_(SHEETS.CR_TRACKER, COLS.CR.CR_NUMBER, crNum);
    var layout = getCRLayout_();
    var total = getSheet_(SHEETS.CR_TRACKER).getRange(crRow, COLS.CR.TOTAL_AMOUNT).getValue();
    getSheet_(SHEETS.CR_TRACKER).getRange(crRow, layout.fsStart).setValue(total);
    SpreadsheetApp.flush();   // let the Funding Total Check formula recompute

    handleCRStatusChange_(crRow, "Submitted", "Draft");
    ok(String(exp.getRange(expRow, COLS.EXP.REIMB_STATUS).getValue()) === "CR Submitted", "Cascade → CR Submitted");
    handleCRStatusChange_(crRow, "Approved by SFSS", "Submitted");
    handleCRStatusChange_(crRow, "Cheque Received", "Approved by SFSS");
    handleCRStatusChange_(crRow, "Distributed", "Cheque Received");
    ok(String(exp.getRange(expRow, COLS.EXP.REIMB_STATUS).getValue()) === "Reimbursed", "Cascade → Reimbursed");

    // 6. Reconciliation + payment distribution.
    recalculateReconciliation();
    generatePaymentDistribution();
    var s2 = findRowByValue_(SHEETS.RECONCILIATION, COLS.RECON.S2_LINKED_IDS, rowId);
    ok(s2 > 0, "Payment Distribution row generated (§2)");

    log.push("— Test Row ID: " + rowId + " · CR: " + crNum);
  });

  var summary = log.join("\n");
  Logger.log(summary);
  try { SpreadsheetApp.getUi().alert("Smoke Test", summary, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return summary;
}

/** Remove the rows created by smokeTest() (matched by the smoke email / vendor). */
function smokeTestCleanup() {
  withLock(function () {
    [SHEETS.EXPENSES, SHEETS.APPROVAL_QUEUE].forEach(function (name) {
      var sh = getSheet_(name);
      var emailCol = (name === SHEETS.EXPENSES) ? COLS.EXP.EMAIL : COLS.AQ.EMAIL;
      for (var r = sh.getLastRow(); r >= 2; r--) {
        if (normalizeEmail(sh.getRange(r, emailCol).getValue()) === SMOKE_EMAIL) { sh.deleteRow(r); }
      }
    });
    Logger.log("Smoke test rows removed (CR rows retained for audit).");
  });
}
