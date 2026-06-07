/**
 * ============================================================================
 * Budgets.gs — budget spending recalculation (§5.8, §3.8)
 * ============================================================================
 * recalculateBudgetSpending() recomputes Spent / Committed / Remaining /
 * Utilization / Health Bar (cols C–G) and applies the status auto-rules
 * (Planning→Active only when spent>0; →Over Budget at over-limit%; Closed is
 * never auto-overridden). Two formula modes per the Include-Committed toggle.
 * Cross-sheet; 5-min timer + relevant onEdit. ES5-compatible.
 * ============================================================================
 */

/** 20-char health bar: █ spent + ▓ committed (capped) + ░ empty + " {n}%". */
function buildBudgetBar_(spent, committed, allocated, util) {
  var base = Math.max(allocated, 1);
  var sc = Math.max(0, Math.min(20, Math.round((spent / base) * 20)));
  var cc = Math.round((committed / base) * 20);
  if (sc + cc > 20) { cc = 20 - sc; }
  cc = Math.max(0, cc);
  var ec = 20 - sc - cc;
  return repeatChar_('█', sc) + repeatChar_('▓', cc) + repeatChar_('░', ec) + ' ' + util + '%';
}

/** Sum Expenses (col G) by Standardized Project, excluding Rejected/Cancelled. */
function _spentByProject_() {
  var map = {};
  var exp = getSheet_(SHEETS.EXPENSES);
  var last = exp.getLastRow();
  if (last < 2) { return map; }
  var data = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][COLS.EXP.REIMB_STATUS - 1] || '').trim() === 'Rejected / Cancelled') { continue; }
    var proj = String(data[i][COLS.EXP.STD_PROJECT - 1] || '').trim();
    if (!proj) { continue; }
    map[proj] = (map[proj] || 0) + parseAmount(data[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
  }
  return map;
}

/** Sum AQ committed (COALESCE verified/submitted) by project for pending statuses. */
function _committedByProject_() {
  var map = {};
  var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
  var last = aq.getLastRow();
  if (last < 2) { return map; }
  var pending = { 'Pending': 1, 'Coordinator Approved': 1, 'Director Approved': 1 };
  var data = aq.getRange(2, 1, last - 1, COLS.AQ.WIDTH).getValues();
  for (var i = 0; i < data.length; i++) {
    if (!pending[String(data[i][COLS.AQ.APPROVAL_STATUS - 1] || '').trim()]) { continue; }
    var proj = String(data[i][COLS.AQ.STD_PROJECT - 1] || '').trim();
    if (!proj) { continue; }
    var amt = coalesceAmount(data[i][COLS.AQ.VERIFIED_AMOUNT - 1], data[i][COLS.AQ.AMOUNT - 1]);
    map[proj] = (map[proj] || 0) + amt;
  }
  return map;
}

function recalculateBudgetSpending() {
  return withLock(function () {
    var cfg = getCfg();
    var sh = getSheet_(SHEETS.BUDGETS);
    var last = sh.getLastRow();
    if (last < 2) { return; }

    var spentMap = _spentByProject_();
    var commMap = _committedByProject_();
    var rows = sh.getRange(2, 1, last - 1, COLS.BUDGET.WIDTH).getValues();
    var include = cfg.includeCommittedInBudget;
    var computed = [];   // C–G (cols 3–7)
    var statusOut = [];  // I   (col 9)

    for (var i = 0; i < rows.length; i++) {
      var project = String(rows[i][COLS.BUDGET.PROJECT - 1] || '').trim();
      var allocated = parseAmount(rows[i][COLS.BUDGET.ALLOCATED - 1]);
      var spent = project ? (spentMap[project] || 0) : 0;
      var committed = project ? (commMap[project] || 0) : 0;

      var remaining, util;
      if (include) {
        remaining = allocated - spent - committed;
        util = allocated > 0 ? Math.round(((spent + committed) / allocated) * 100) : 0;
      } else {
        remaining = allocated - spent;
        util = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;
      }
      computed.push([roundMoney(spent), roundMoney(committed), roundMoney(remaining), util + '%',
        buildBudgetBar_(spent, committed, allocated, util)]);

      // Status auto-rules (§3.8 / §5.8) — Closed is never overridden.
      var curStatus = String(rows[i][COLS.BUDGET.STATUS - 1] || '').trim();
      var newStatus = curStatus;
      if (curStatus !== 'Closed') {
        if (util >= cfg.budgetOverLimitPercent) { newStatus = 'Over Budget'; }
        else if (spent > 0) { newStatus = 'Active'; }
        // else: leave unchanged (Planning stays Planning — committed alone never triggers).
      }
      if (newStatus !== curStatus) {
        logToAudit('STATUS_CHANGE', { sheet: SHEETS.BUDGETS, recordId: project,
          field: 'Status', oldValue: curStatus, newValue: newStatus });
      }
      statusOut.push([newStatus]);
    }

    sh.getRange(2, COLS.BUDGET.SPENT, computed.length, 5).setValues(computed);   // C–G
    sh.getRange(2, COLS.BUDGET.STATUS, statusOut.length, 1).setValues(statusOut); // I
    try { notifyRevalidate_('dashboard'); } catch (e) {}
  });
}
