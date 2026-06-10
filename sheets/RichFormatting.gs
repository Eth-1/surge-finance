/**
 * ============================================================================
 * RichFormatting.gs — one-time "make every sheet scannable" pass (V3)
 * ============================================================================
 * Run applyRichFormatting() once (also in ⚡ Surge Finance ▸ Apply Rich
 * Formatting). Idempotent: it REPLACES each sheet's conditional-format rules
 * with a complete, richer set (supersedes the bootstrap basics), so re-running
 * never stacks duplicates. Colors are soft tints — readable, not noisy:
 * uncolored = nothing to do; tint = state worth noticing.
 *
 * Covers: Approval Queue, Mileage, Expenses, CR Tracker, Grants, Budgets,
 * Loans, Reconciliation, Settings (changed-from-default), plus row banding on
 * Audit Log & Form Responses. ES5; reuses bsFormulaRule_/BS_FMT from bootstrap.
 * ============================================================================
 */

var RF = {
  GREEN:  '#E3F0E4',   // settled / good
  BLUE:   '#E4EBF6',   // in progress (early)
  TEAL:   '#DFEEEC',   // in progress (with SFSS / money moving)
  AMBER:  '#FBEDCF',   // waiting on someone / warning
  ORANGE: '#FFE0B2',   // action required
  RED:    '#F6DBD8',   // urgent / over / mismatch
  GRAY:   '#E9E7E4',   // terminal-inactive (rejected/cancelled/closed)
  PURPLE: '#ECE0F1',   // duplicates
  GOLD:   '#F6ECD2'    // money owed to people / changed-from-default
};

function applyRichFormatting() {
  var ss = SpreadsheetApp.getActive();
  var done = [];

  // ---------- Approval Queue (status Q; dup M; age N; review R/S; reason U) ----------
  var aq = ss.getSheetByName(BS_SHEETS.APPROVAL_QUEUE);
  if (aq) {
    aq.setConditionalFormatRules([
      bsFormulaRule_(aq, 'A2:A1000', '=$Q2="Fully Approved"', BS_FMT.ACCENT_GRN, BS_COLOR.HEADER_TEXT),
      bsFormulaRule_(aq, 'A2:X1000', '=$Q2="Rejected"', RF.GRAY),
      bsFormulaRule_(aq, 'A2:X1000', '=$Q2="Moved to Expenses"', RF.GRAY),
      bsFormulaRule_(aq, 'A2:X1000', '=$Q2="Fully Approved"', RF.GREEN),
      bsFormulaRule_(aq, 'A2:X1000', '=OR($Q2="Coordinator Approved",$Q2="Director Approved")', RF.BLUE),
      bsFormulaRule_(aq, 'A2:X1000', '=ISNUMBER(SEARCH("DUPLICATE",$M2))', RF.PURPLE),
      // Cell-level nudges:
      bsFormulaRule_(aq, 'N2:N1000', '=ISNUMBER(SEARCH("⚠",N2))', RF.AMBER),                     // stale receipt
      bsFormulaRule_(aq, 'R2:S1000', '=AND($Q2="Fully Approved",ISBLANK(R2))', RF.ORANGE),       // ready but missing Project/Category
      bsFormulaRule_(aq, 'U2:U1000', '=U2<>""', RF.RED)                                          // rejection reason present
    ]);
    done.push('Approval Queue');
  }

  // ---------- Mileage Approvals (status L) ----------
  var mi = ss.getSheetByName(BS_SHEETS.MILEAGE_APPROVALS);
  if (mi) {
    mi.setConditionalFormatRules([
      bsFormulaRule_(mi, 'A2:P1000', '=$L2="Rejected"', RF.GRAY),
      bsFormulaRule_(mi, 'A2:P1000', '=$L2="Moved to Expenses"', RF.GRAY),
      bsFormulaRule_(mi, 'A2:P1000', '=$L2="Approved"', RF.GREEN),
      bsFormulaRule_(mi, 'L2:L1000', '=L2="Pending"', RF.AMBER)
    ]);
    done.push('Mileage Approvals');
  }

  // ---------- Expenses (status O; follow-up T; Advanced By X) ----------
  var ex = ss.getSheetByName(BS_SHEETS.EXPENSES);
  if (ex) {
    ex.setConditionalFormatRules([
      bsFormulaRule_(ex, 'A2:X1000', '=$O2="Rejected / Cancelled"', RF.GRAY),
      bsFormulaRule_(ex, 'A2:X1000', '=$O2="Reimbursed"', RF.GREEN),
      bsFormulaRule_(ex, 'A2:X1000', '=$O2="Action Required"', RF.ORANGE),
      bsFormulaRule_(ex, 'A2:X1000', '=OR($O2="Awaiting Payment",$O2="Follow Up Required")', RF.AMBER),
      bsFormulaRule_(ex, 'A2:X1000', '=$O2="Payment Received"', RF.TEAL),
      bsFormulaRule_(ex, 'A2:X1000', '=OR($O2="CR Submitted",$O2="Approved by SFSS")', RF.TEAL),
      bsFormulaRule_(ex, 'A2:X1000', '=OR($O2="Approved",$O2="CR Draft",$O2="CR Ready to Submit")', RF.BLUE),
      bsFormulaRule_(ex, 'T2:T1000', '=ISNUMBER(SEARCH("🔴",T2))', RF.RED),
      bsFormulaRule_(ex, 'T2:T1000', '=ISNUMBER(SEARCH("🟡",T2))', RF.AMBER),
      bsFormulaRule_(ex, 'X2:X1000', '=X2<>""', RF.GOLD)                                          // personal advance marker
    ]);
    done.push('Expenses');
  }

  // ---------- CR Tracker (status H; flag N; funding check col is dynamic) ----------
  var cr = ss.getSheetByName(BS_SHEETS.CR_TRACKER);
  if (cr) {
    var layout = getCRLayout_();
    var checkL = columnToLetter_(layout.checkCol);
    var lastL = columnToLetter_(layout.checkCol);
    var crRange = 'A2:' + lastL + '1000';
    cr.setConditionalFormatRules([
      bsFormulaRule_(cr, crRange, '=$H2="Cancelled"', RF.GRAY),
      bsFormulaRule_(cr, crRange, '=$H2="Distributed"', RF.GREEN),
      bsFormulaRule_(cr, crRange, '=$H2="Cheque Received"', RF.GREEN),
      bsFormulaRule_(cr, crRange, '=$H2="Action Required"', RF.ORANGE),
      bsFormulaRule_(cr, crRange, '=$H2="Follow Up"', RF.AMBER),
      bsFormulaRule_(cr, crRange, '=OR($H2="Submitted",$H2="Approved by SFSS")', RF.TEAL),
      bsFormulaRule_(cr, crRange, '=$H2="Ready to Submit"', RF.BLUE),
      bsFormulaRule_(cr, 'N2:N1000', '=ISNUMBER(SEARCH("🔴",N2))', RF.RED),
      bsFormulaRule_(cr, 'N2:N1000', '=OR(ISNUMBER(SEARCH("🟡",N2)),ISNUMBER(SEARCH("📝",N2)))', RF.AMBER),
      bsFormulaRule_(cr, checkL + '2:' + checkL + '1000', '=ISNUMBER(SEARCH("Mismatch",' + checkL + '2))', RF.RED),
      bsFormulaRule_(cr, checkL + '2:' + checkL + '1000', '=ISNUMBER(SEARCH("Match",' + checkL + '2))', RF.GREEN)
    ]);
    done.push('CR Tracker');
  }

  // ---------- Grants (status F; utilization J as "{n}%") ----------
  var gr = ss.getSheetByName(BS_SHEETS.GRANTS);
  if (gr) {
    gr.setConditionalFormatRules([
      bsFormulaRule_(gr, 'A2:T1000', '=$F2="Denied"', RF.GRAY),
      bsFormulaRule_(gr, 'A2:T1000', '=OR($F2="Approved",$F2="Appeal Approved")', RF.GREEN),
      bsFormulaRule_(gr, 'A2:T1000', '=OR($F2="Appealed",$F2="Partially Approved")', RF.AMBER),
      bsFormulaRule_(gr, 'A2:T1000', '=OR($F2="Applied",$F2="Under Review")', RF.BLUE),
      bsFormulaRule_(gr, 'J2:J1000', '=AND(J2<>"",VALUE(SUBSTITUTE(J2,"%",""))>=95)', RF.RED),
      bsFormulaRule_(gr, 'J2:J1000', '=AND(J2<>"",VALUE(SUBSTITUTE(J2,"%",""))>=80)', RF.AMBER),
      bsFormulaRule_(gr, 'Q2:Q1000', '=Q2<>""', RF.AMBER)                                         // follow-up flag
    ]);
    done.push('Grants');
  }

  // ---------- Budgets (status I; remaining E; utilization F) ----------
  var bu = ss.getSheetByName(BS_SHEETS.BUDGETS);
  if (bu) {
    bu.setConditionalFormatRules([
      bsFormulaRule_(bu, 'A2:K1000', '=$I2="Over Budget"', RF.RED),
      bsFormulaRule_(bu, 'A2:K1000', '=$I2="Closed"', RF.GRAY),
      bsFormulaRule_(bu, 'A2:K1000', '=$I2="Active"', RF.GREEN),
      bsFormulaRule_(bu, 'E2:E1000', '=AND(E2<>"",E2<0)', RF.RED),
      bsFormulaRule_(bu, 'F2:F1000', '=AND(F2<>"",VALUE(SUBSTITUTE(F2,"%",""))>=90)', RF.RED),
      bsFormulaRule_(bu, 'F2:F1000', '=AND(F2<>"",VALUE(SUBSTITUTE(F2,"%",""))>=75)', RF.AMBER)
    ]);
    done.push('Budgets');
  }

  // ---------- Loans (status H; flag M) ----------
  var lo = ss.getSheetByName(BS_SHEETS.LOANS);
  if (lo) {
    lo.setConditionalFormatRules([
      bsFormulaRule_(lo, 'A2:N1000', '=ISNUMBER(SEARCH("OVERDUE",$M2))', RF.RED),
      bsFormulaRule_(lo, 'A2:N1000', '=$H2="Repaid"', RF.GREEN),
      bsFormulaRule_(lo, 'A2:N1000', '=$H2="Partially Repaid"', RF.AMBER),
      bsFormulaRule_(lo, 'A2:N1000', '=$H2="Open"', RF.GOLD)
    ]);
    done.push('Loans');
  }

  // ---------- Reconciliation (§1 rows 3–19 flags; §2 rows 22+ reconciled) ----------
  var re = ss.getSheetByName(BS_SHEETS.RECONCILIATION);
  if (re) {
    re.setConditionalFormatRules([
      bsFormulaRule_(re, 'I3:I19', '=ISNUMBER(SEARCH("Mismatch",I3))', RF.RED),
      bsFormulaRule_(re, 'I3:I19', '=ISNUMBER(SEARCH("Match",I3))', RF.GREEN),
      bsFormulaRule_(re, 'K3:K19', '=ISNUMBER(SEARCH("Shortfall",K3))', RF.RED),
      bsFormulaRule_(re, 'K3:K19', '=ISNUMBER(SEARCH("Covered",K3))', RF.GREEN),
      bsFormulaRule_(re, 'L3:L19', '=L3="Y"', RF.GREEN),
      bsFormulaRule_(re, 'G22:G500', '=G22="Y"', RF.GREEN),
      bsFormulaRule_(re, 'G22:G500', '=G22="N"', RF.AMBER)
    ]);
    done.push('Reconciliation');
  }

  // ---------- Settings: highlight values changed from their Default ----------
  var st = ss.getSheetByName(BS_SHEETS.SETTINGS);
  if (st) {
    var kvEnd = 1 + bsSettingsRows_().length;   // key-value section only (not the lists)
    st.setConditionalFormatRules([
      bsFormulaRule_(st, 'B2:B' + kvEnd, '=AND($A2<>"",$D2<>"",TO_TEXT($B2)<>TO_TEXT($D2))', RF.GOLD)
    ]);
    done.push('Settings');
  }

  // ---------- Row banding for log-style sheets (readability) ----------
  _applyBanding_(ss.getSheetByName(BS_SHEETS.AUDIT_LOG), 9);
  _applyBanding_(ss.getSheetByName(BS_SHEETS.FORM_RESPONSES), 11);
  _applyBanding_(ss.getSheetByName(BS_SHEETS.MILEAGE_RESPONSES), 10);
  done.push('banding (Audit Log + Form Responses)');

  ss.toast('Rich formatting applied: ' + done.join(', '), 'Surge Finance', 8);
  Logger.log('applyRichFormatting → ' + done.join(', '));
}

/** Replace any existing banding on a sheet with subtle light-grey row banding. */
function _applyBanding_(sh, cols) {
  if (!sh) { return; }
  var bands = sh.getBandings();
  for (var i = 0; i < bands.length; i++) { bands[i].remove(); }
  try {
    sh.getRange(1, 1, 2000, cols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  } catch (e) { /* range conflicts (e.g. merged cells) — skip silently */ }
}
