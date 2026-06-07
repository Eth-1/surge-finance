/**
 * ============================================================================
 * Grants.gs — grant utilization recalculation (§5.9, §5.10, §3.7)
 * ============================================================================
 * recalculateGrantUtilization() recomputes Amount Spent / Remaining /
 * Utilization % / Utilization Bar (cols H–K) and Follow-Up Date/Flag (P/Q) for
 * every grant. Effective approved = COALESCE(Appeal Amount Approved, Amount
 * Approved). Flags only — grant Status is manual (§3.7). Cross-sheet; runs on
 * the 5-min timer + relevant onEdit. ES5-compatible.
 * ============================================================================
 */

/** 20-char single-segment utilization bar: █ filled + ░ empty + " {n}%". */
function buildGrantBar_(util) {
  var filled = Math.max(0, Math.min(20, Math.round((util / 100) * 20)));
  return repeatChar_('█', filled) + repeatChar_('░', 20 - filled) + ' ' + util + '%';
}

/** Sum Expenses (col G) grouped by Funding Source, excluding Rejected/Cancelled. */
function _spendByFundingSource_() {
  var map = {};
  var exp = getSheet_(SHEETS.EXPENSES);
  var last = exp.getLastRow();
  if (last < 2) { return map; }
  var data = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
  for (var i = 0; i < data.length; i++) {
    var status = String(data[i][COLS.EXP.REIMB_STATUS - 1] || '').trim();
    if (status === 'Rejected / Cancelled') { continue; }
    var fs = String(data[i][COLS.EXP.FUNDING_SOURCE - 1] || '').trim();
    if (!fs) { continue; }
    map[fs] = (map[fs] || 0) + parseAmount(data[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
  }
  return map;
}

function recalculateGrantUtilization() {
  return withLock(function () {
    var cfg = getCfg();
    var sh = getSheet_(SHEETS.GRANTS);
    var last = sh.getLastRow();
    if (last < 2) { return; }

    var spend = _spendByFundingSource_();
    var grants = sh.getRange(2, 1, last - 1, COLS.GRANT.WIDTH).getValues();
    var computed = [];   // H,I,J,K  (cols 8–11)
    var flags = [];      // P,Q      (cols 16–17)
    var today = new Date();

    for (var i = 0; i < grants.length; i++) {
      var g = grants[i];
      var name = String(g[COLS.GRANT.GRANT_NAME - 1] || '').trim();
      var approved = parseAmount(g[COLS.GRANT.AMT_APPROVED - 1]);
      var appeal = g[COLS.GRANT.APPEAL_AMT_APPROVED - 1];
      var effective = coalesceAmount(appeal, approved);     // §5.9 effective approved
      var spent = name ? (spend[name] || 0) : 0;
      var remaining = Math.max(0, effective - spent);
      var util = (effective > 0) ? Math.round((spent / effective) * 100) : 0;
      computed.push([roundMoney(spent), roundMoney(remaining), util + '%', buildGrantBar_(util)]);

      // Follow-up flags (§5.10) — flag only, no status change.
      var status = String(g[COLS.GRANT.STATUS - 1] || '').trim();
      var flag = '', fuDate = '';
      if (status === 'Applied' || status === 'Under Review') {
        var appDate = toDate_(g[COLS.GRANT.APP_DATE - 1]);
        if (appDate && daysSince(appDate) > cfg.grantFollowUpDays) {
          flag = '🟡 FOLLOW UP: ' + daysSince(appDate) + ' days since application';
          fuDate = today;
        }
      } else if (status === 'Partially Approved') {
        var anchor = toDate_(g[COLS.GRANT.APP_DATE - 1]);
        var left = anchor ? Math.max(0, cfg.grantAppealWindowDays - daysSince(anchor)) : cfg.grantAppealWindowDays;
        flag = '🟡 APPEAL WINDOW: file appeal within ' + left + ' days';
        fuDate = today;
      }
      flags.push([fuDate, flag]);
    }

    sh.getRange(2, COLS.GRANT.AMT_SPENT, computed.length, 4).setValues(computed);    // H–K
    sh.getRange(2, COLS.GRANT.FOLLOWUP_DATE, flags.length, 2).setValues(flags);      // P–Q
    try { notifyRevalidate_('dashboard'); } catch (e) {}
  });
}
