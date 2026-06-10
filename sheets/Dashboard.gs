/**
 * ============================================================================
 * Dashboard.gs — KPI / chart / pipeline / activity / alert aggregations (§5.14)
 * ============================================================================
 * dashboardPayload_(fyLabel) returns the full read-only dashboard object. All
 * amounts use Expenses col G (already COALESCE(verified, submitted) at move).
 * Charts/KPIs exclude Rejected/Cancelled; the pipeline includes every status.
 * refreshDashboardData() + the revalidate webhook are in task 3.6.
 * ES5-compatible.
 * ============================================================================
 */

var _REJECTED = 'Rejected / Cancelled';

/** Effective fiscal-year label for an Expenses row (col W, else from Purchase Date). */
function _expRowFy_(row) {
  var fy = String(row[COLS.EXP.FISCAL_YEAR - 1] || '').trim();
  if (fy) { return fy; }
  var pd = toDate_(row[COLS.EXP.PURCHASE_DATE - 1]);
  return pd ? fiscalYearForDate(pd).label : '';
}

/** Mask an email for display: "john.smith@sfu.ca" → "j***@sfu.ca" (§4.5d). */
function _maskEmail_(email) {
  var e = String(email || '');
  var at = e.indexOf('@');
  if (at < 1) { return e ? (e.charAt(0) + '***') : 'unknown'; }
  return e.charAt(0) + '***' + e.substring(at);
}

/** Build the full dashboard payload for a fiscal-year label. */
function dashboardPayload_(fyLabel) {
  var fy = fyLabel || currentFiscalYearLabel();
  var exp = getSheet_(SHEETS.EXPENSES);
  var last = exp.getLastRow();
  var fyRows = [];
  if (last >= 2) {
    var all = exp.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues();
    for (var i = 0; i < all.length; i++) { if (_expRowFy_(all[i]) === fy) { fyRows.push(all[i]); } }
  }
  var advances = _computeAdvances_(fyRows);
  var loans = computeLoansSummary_();   // V3 — additive (zeros when no Loans sheet yet)
  return {
    fiscalYear: fy,
    generatedAt: formatDate(new Date(), 'MMM d, yyyy h:mm a'),
    kpis: _computeKPIs_(fyRows),
    charts: _computeCharts_(fyRows),
    pipeline: _computePipeline_(fyRows),
    activity: _computeActivity_(),
    alerts: _computeAlerts_(advances, loans),
    reconciliation: computeReconciliationSummary_(),
    readyToMoveCount: countFullyApproved_(),
    advances: advances,
    loans: loans,
    lists: _buildListsPayload_()
  };
}

/**
 * E-1 — Outstanding personal advances. An advance is outstanding when an expense
 * has `Advanced By` set AND its linked CR has not yet been Distributed (SFSS has
 * not repaid the club). Settles automatically when the CR is Distributed, or
 * when finance clears the Advanced By cell after being repaid.
 * @return { outstandingTotal, outstandingTotalDisplay, count, byPerson[] }
 */
function _computeAdvances_(rows) {
  // CR# → status map (to know which advances SFSS has already repaid).
  var crStatus = {};
  var cr = getSheet_(SHEETS.CR_TRACKER), crLast = cr.getLastRow();
  if (crLast >= 2) {
    var cd = cr.getRange(2, 1, crLast - 1, COLS.CR.FIXED_WIDTH).getValues();
    for (var c = 0; c < cd.length; c++) {
      crStatus[String(cd[c][COLS.CR.CR_NUMBER - 1] || '').trim()] = String(cd[c][COLS.CR.STATUS - 1] || '').trim();
    }
  }
  var byPerson = {}, total = 0, count = 0;
  for (var i = 0; i < rows.length; i++) {
    var advBy = String(rows[i][COLS.EXP.ADVANCED_BY - 1] || '').trim();
    if (!advBy) { continue; }
    var crNum = String(rows[i][COLS.EXP.CR_NUMBER - 1] || '').trim();
    var settled = (crNum && crStatus[crNum] === 'Distributed');   // SFSS repaid the club
    if (settled) { continue; }
    var amt = parseAmount(rows[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
    total += amt; count++;
    if (!byPerson[advBy]) { byPerson[advBy] = { person: advBy, amount: 0, count: 0 }; }
    byPerson[advBy].amount += amt; byPerson[advBy].count++;
  }
  var people = [];
  for (var p in byPerson) {
    if (byPerson.hasOwnProperty(p)) {
      people.push({ person: p, amount: roundMoney(byPerson[p].amount),
        amountDisplay: formatCAD(byPerson[p].amount), count: byPerson[p].count });
    }
  }
  people.sort(function (a, b) { return b.amount - a.amount; });
  return { outstandingTotal: roundMoney(total), outstandingTotalDisplay: formatCAD(total), count: count, byPerson: people };
}

function _computeKPIs_(rows) {
  var total = 0, outstanding = 0;
  for (var i = 0; i < rows.length; i++) {
    var st = String(rows[i][COLS.EXP.REIMB_STATUS - 1] || '').trim();
    if (st === _REJECTED) { continue; }
    var amt = parseAmount(rows[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
    total += amt;
    if (st !== 'Reimbursed') { outstanding += amt; }
  }
  // Active CRs.
  var cr = getSheet_(SHEETS.CR_TRACKER), activeCRs = 0, crLast = cr.getLastRow();
  if (crLast >= 2) {
    var cs = cr.getRange(2, COLS.CR.STATUS, crLast - 1, 1).getValues();
    for (var c = 0; c < cs.length; c++) {
      var s = String(cs[c][0] || '').trim();
      if (s && s !== 'Distributed' && s !== 'Cancelled') { activeCRs++; }
    }
  }
  // Grants + avg utilization.
  var gr = getSheet_(SHEETS.GRANTS), grLast = gr.getLastRow(), totalGrants = 0, utilSum = 0;
  if (grLast >= 2) {
    var gv = gr.getRange(2, 1, grLast - 1, COLS.GRANT.WIDTH).getValues();
    for (var g = 0; g < gv.length; g++) {
      if (!String(gv[g][COLS.GRANT.GRANT_NAME - 1] || '').trim()) { continue; }
      totalGrants++;
      utilSum += parseInt(String(gv[g][COLS.GRANT.UTILIZATION - 1]).replace(/[^0-9]/g, ''), 10) || 0;
    }
  }
  return {
    totalExpenses: roundMoney(total), totalExpensesDisplay: formatCAD(total),
    outstanding: roundMoney(outstanding), outstandingDisplay: formatCAD(outstanding),
    activeCRs: activeCRs, totalGrants: totalGrants,
    avgGrantUtilization: totalGrants ? Math.round(utilSum / totalGrants) : 0
  };
}

function _computeCharts_(rows) {
  var cat = {}, proj = {}, fund = {}, month = {}, sub = {};
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COLS.EXP.REIMB_STATUS - 1] || '').trim() === _REJECTED) { continue; }
    var amt = parseAmount(rows[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
    _add_(cat, String(rows[i][COLS.EXP.CATEGORY - 1] || '').trim() || 'Uncategorized', amt);
    _add_(proj, String(rows[i][COLS.EXP.STD_PROJECT - 1] || '').trim() || 'Unassigned', amt);
    _add_(fund, String(rows[i][COLS.EXP.FUNDING_SOURCE - 1] || '').trim() || 'Unassigned', amt);
    var pd = toDate_(rows[i][COLS.EXP.PURCHASE_DATE - 1]);
    if (pd) { _add_(month, monthKey(pd), amt); }
    var email = normalizeEmail(rows[i][COLS.EXP.EMAIL - 1]);
    if (email) {
      if (!sub[email]) { sub[email] = { total: 0, count: 0, outstanding: 0 }; }
      sub[email].total += amt; sub[email].count++;
      if (String(rows[i][COLS.EXP.REIMB_STATUS - 1] || '').trim() !== 'Reimbursed') { sub[email].outstanding += amt; }
    }
  }
  // Top 10 submitters by total, masked.
  var subArr = [];
  for (var em in sub) { if (sub.hasOwnProperty(em)) { subArr.push({ email: em, d: sub[em] }); } }
  subArr.sort(function (a, b) { return b.d.total - a.d.total; });
  var top = [];
  for (var t = 0; t < Math.min(10, subArr.length); t++) {
    top.push({ label: _maskEmail_(subArr[t].email), value: roundMoney(subArr[t].d.total),
      count: subArr[t].d.count, outstanding: roundMoney(subArr[t].d.outstanding) });
  }
  return {
    byCategory: _mapToPairs_(cat), byProject: _mapToPairs_(proj),
    byFundingSource: _mapToPairs_(fund), monthly: _mapToPairs_(month, true), topSubmitters: top
  };
}

function _add_(map, key, amt) { map[key] = (map[key] || 0) + amt; }

function _mapToPairs_(map, sortByLabel) {
  var arr = [];
  for (var k in map) { if (map.hasOwnProperty(k)) { arr.push({ label: k, value: roundMoney(map[k]) }); } }
  if (sortByLabel) { arr.sort(function (a, b) { return a.label < b.label ? -1 : 1; }); }
  else { arr.sort(function (a, b) { return b.value - a.value; }); }
  return arr;
}

/** Reimbursement pipeline: every status with count + total (§5.14). */
function _computePipeline_(rows) {
  var statuses = getListValues('ReimbursementStatuses');
  var map = {};
  for (var s = 0; s < statuses.length; s++) { map[statuses[s]] = { count: 0, total: 0 }; }
  for (var i = 0; i < rows.length; i++) {
    var st = String(rows[i][COLS.EXP.REIMB_STATUS - 1] || '').trim() || 'Approved';
    if (!map[st]) { map[st] = { count: 0, total: 0 }; }
    map[st].count++;
    map[st].total += parseAmount(rows[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
  }
  var out = [];
  for (var k = 0; k < statuses.length; k++) {
    var d = map[statuses[k]];
    out.push({ status: statuses[k], count: d.count, total: roundMoney(d.total), totalDisplay: formatCAD(d.total) });
  }
  return out;
}

/** 15 most recent Audit Log entries (§5.16). */
function _computeActivity_() {
  var sh = getSheet_(SHEETS.AUDIT_LOG);
  var last = sh.getLastRow();
  if (last < 2) { return []; }
  var n = Math.min(getCfg().activityFeedCount, last - 1);
  var rows = sh.getRange(last - n + 1, 1, n, COLS.AUDIT.WIDTH).getValues();
  var out = [];
  for (var i = rows.length - 1; i >= 0; i--) {   // newest first
    out.push({ timestamp: String(rows[i][COLS.AUDIT.TIMESTAMP - 1] || ''), user: String(rows[i][COLS.AUDIT.USER - 1] || ''),
      action: String(rows[i][COLS.AUDIT.ACTION - 1] || ''), recordId: String(rows[i][COLS.AUDIT.RECORD_ID - 1] || ''),
      detail: String(rows[i][COLS.AUDIT.NEW - 1] || ''), sheet: String(rows[i][COLS.AUDIT.SHEET - 1] || '') });
  }
  return out;
}

/** Dashboard alerts, severity-sorted (§4.22 + Action Required + X4 + advances + V3 loans). */
function _computeAlerts_(advances, loans) {
  var cfg = getCfg(), alerts = [];
  function push(sev, msg) { alerts.push({ severity: sev, message: msg }); }

  var bu = getSheet_(SHEETS.BUDGETS), buLast = bu.getLastRow();
  if (buLast >= 2) {
    var bv = bu.getRange(2, 1, buLast - 1, COLS.BUDGET.WIDTH).getValues();
    for (var i = 0; i < bv.length; i++) {
      var proj = String(bv[i][COLS.BUDGET.PROJECT - 1] || '').trim();
      if (!proj) { continue; }
      var util = parseInt(String(bv[i][COLS.BUDGET.UTILIZATION - 1]).replace(/[^0-9]/g, ''), 10) || 0;
      if (String(bv[i][COLS.BUDGET.STATUS - 1]).trim() === 'Over Budget' || util >= cfg.budgetCriticalPercent) {
        push('critical', 'Budget over/near limit: ' + proj + ' at ' + util + '%');
      } else if (util >= cfg.budgetWarningPercent) { push('warning', proj + ' budget at ' + util + '%'); }
    }
  }
  var gr = getSheet_(SHEETS.GRANTS), grLast = gr.getLastRow();
  if (grLast >= 2) {
    var gv = gr.getRange(2, 1, grLast - 1, COLS.GRANT.WIDTH).getValues();
    for (var g = 0; g < gv.length; g++) {
      var name = String(gv[g][COLS.GRANT.GRANT_NAME - 1] || '').trim();
      if (!name) { continue; }
      var gu = parseInt(String(gv[g][COLS.GRANT.UTILIZATION - 1]).replace(/[^0-9]/g, ''), 10) || 0;
      if (gu >= cfg.grantCriticalPercent) { push('critical', 'Grant ' + name + ' at ' + gu + '%'); }
      else if (gu >= cfg.grantWarningPercent) { push('warning', 'Grant ' + name + ' at ' + gu + '%'); }
    }
  }
  var cr = getSheet_(SHEETS.CR_TRACKER), crLast = cr.getLastRow(), actionCt = 0;
  if (crLast >= 2) {
    var cv = cr.getRange(2, 1, crLast - 1, COLS.CR.FIXED_WIDTH).getValues();
    for (var c = 0; c < cv.length; c++) {
      var flag = String(cv[c][COLS.CR.FOLLOWUP_FLAG - 1] || '');
      if (flag.indexOf('URGENT') > -1) { push('critical', cv[c][COLS.CR.CR_NUMBER - 1] + ': ' + flag); }
      else if (flag.indexOf('FOLLOW UP') > -1 || flag.indexOf('Draft for') > -1) { push('warning', cv[c][COLS.CR.CR_NUMBER - 1] + ': ' + flag); }
      if (String(cv[c][COLS.CR.STATUS - 1]).trim() === 'Action Required') { actionCt++; }
    }
  }
  if (actionCt > 0) { push('warning', actionCt + ' CR(s) need action (info requested by SFSS)'); }

  var ready = countFullyApproved_();
  if (ready > 0) { push('info', ready + ' approval(s) ready to move to Expenses'); }

  // E-1: personal advances awaiting club repayment.
  if (advances && advances.outstandingTotal > 0) {
    push('warning', 'Personal advances outstanding: ' + advances.outstandingTotalDisplay +
      ' owed to ' + advances.byPerson.length + ' person(s)');
  }

  // V3: member loans owed by the club.
  if (loans && loans.outstandingTotal > 0) {
    push(loans.overdueCount > 0 ? 'critical' : 'warning',
      'Member loans outstanding: ' + loans.outstandingTotalDisplay + ' owed to ' +
      loans.byLender.length + ' lender(s)' +
      (loans.overdueCount > 0 ? ' — ' + loans.overdueCount + ' OVERDUE' : ''));
    if (loans.readyToRepayCount > 0) {
      push('warning', loans.readyToRepayCount + ' loan(s) ready to repay — linked CR distributed');
    }
  }

  var rank = { critical: 0, warning: 1, info: 2 };
  alerts.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
  return alerts;
}

/** Configurable lists the UI needs for filters/dropdowns. */
function _buildListsPayload_() {
  return {
    reimbursementStatuses: getListValues('ReimbursementStatuses'),
    projectNames: getListValues('ProjectNames'),
    expenseCategories: getListValues('ExpenseCategories'),
    fundingSources: getListValues('FundingSources'),
    selfServiceVisibleFields: getListValues('SelfServiceVisibleFields')
  };
}

/* ================================================================== *
 * 3.6 — Write-through cache + revalidate webhook (§6.1 Layers 1 & 3)  *
 * ================================================================== */

/** Recompute the dashboard payload and write it to the Dashboard Data cache. */
function refreshDashboardData() {
  var payload = dashboardPayload_(currentFiscalYearLabel());
  var entries = {
    lastRefresh: new Date().toISOString(),
    version: WEBAPP_VERSION,
    fiscalYear: payload.fiscalYear,
    kpis: payload.kpis,
    chartByCategory: payload.charts.byCategory,
    chartByProject: payload.charts.byProject,
    chartByFundingSource: payload.charts.byFundingSource,
    chartMonthly: payload.charts.monthly,
    chartTopSubmitters: payload.charts.topSubmitters,
    pipeline: payload.pipeline,
    alerts: payload.alerts,
    activity: payload.activity,
    lists: payload.lists,
    reconciliationSummary: payload.reconciliation,
    yearEndChecklist: computeYearEndChecklist_(),
    readyToMoveCount: payload.readyToMoveCount,
    advances: payload.advances,
    loans: payload.loans,
    health: { status: 'ok' }
  };

  var sh = getSheet_(SHEETS.DASHBOARD_DATA);
  var last = sh.getLastRow();
  var keyRows = {};
  if (last >= 2) {
    var ka = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ka.length; i++) { keyRows[String(ka[i][0])] = i + 2; }
  }
  var now = new Date();
  for (var key in entries) {
    if (!entries.hasOwnProperty(key)) { continue; }
    var row = keyRows[key];
    if (!row) { row = sh.getLastRow() + 1; sh.getRange(row, 1).setValue(key); keyRows[key] = row; }
    sh.getRange(row, 2).setValue(JSON.stringify(entries[key]));
    sh.getRange(row, 3).setValue(now);
  }
}

/** Read a parsed value from the Dashboard Data cache (null if missing/invalid). */
function getDashboardCache_(key) {
  var sh = getSheet_(SHEETS.DASHBOARD_DATA);
  var last = sh.getLastRow();
  if (last < 2) { return null; }
  var vals = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === key) {
      try { return JSON.parse(vals[i][1]); } catch (e) { return null; }
    }
  }
  return null;
}

/**
 * Fire the Next.js revalidation webhook for a tag (D1). Debounced 30s/tag and
 * fully fault-tolerant — a webhook failure must never break the triggering edit.
 */
function notifyRevalidate_(tag) {
  try {
    var cfg = getCfg();
    var url = cfg.revalidateWebhookUrl;
    if (!url) { return; }
    var cache = CacheService.getScriptCache();
    var dk = 'reval_' + tag;
    if (cache.get(dk)) { return; }                       // within debounce window
    cache.put(dk, '1', cfg.webhookDebounceSeconds);
    UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ tag: tag, secret: getRevalidateSecret() }),
      muteHttpExceptions: true
    });
  } catch (e) { /* swallow — never break the edit */ }
}
