/**
 * ============================================================================
 * WebAppReports.gs — dashboard / submissions / report / yearend / budgetImpact
 * ============================================================================
 * Token-gated endpoints (router calls these via _guard_). dashboard reads the
 * write-through cache; submissions unions AQ+Expenses+Mileage with filters +
 * pagination (§4.5c); report unions Archive for pre-live-window periods (§5.17).
 * ES5-compatible.
 * ============================================================================
 */

/* ------------------------------ dashboard ------------------------------ */
function resolveFyLabel_(fyParam) {
  var f = String(fyParam || '').trim();
  if (!f) { return currentFiscalYearLabel(); }
  if (f.indexOf('FY') === 0) { return f; }
  if (/^\d{4}$/.test(f)) { var start = 2000 + parseInt(f.substring(0, 2), 10); return 'FY ' + start + '–' + (start + 1); }
  return currentFiscalYearLabel();
}

function readDashboardFromCache_() {
  var lr = getDashboardCache_('lastRefresh');
  if (!lr) { return null; }
  return {
    ok: true, lastRefresh: lr, fiscalYear: getDashboardCache_('fiscalYear'),
    kpis: getDashboardCache_('kpis'),
    charts: {
      byCategory: getDashboardCache_('chartByCategory'), byProject: getDashboardCache_('chartByProject'),
      byFundingSource: getDashboardCache_('chartByFundingSource'), monthly: getDashboardCache_('chartMonthly'),
      topSubmitters: getDashboardCache_('chartTopSubmitters')
    },
    pipeline: getDashboardCache_('pipeline'), alerts: getDashboardCache_('alerts'),
    activity: getDashboardCache_('activity'), reconciliation: getDashboardCache_('reconciliationSummary'),
    readyToMoveCount: getDashboardCache_('readyToMoveCount'), lists: getDashboardCache_('lists')
  };
}

function handleDashboard_(e) {
  var fy = resolveFyLabel_(e.parameter && e.parameter.fy);
  if (fy === currentFiscalYearLabel()) {
    var cached = readDashboardFromCache_();
    if (cached) { return cached; }
  }
  var p = dashboardPayload_(fy);     // live fallback (cache empty) or non-current FY
  p.ok = true; p.lastRefresh = new Date().toISOString();
  return p;
}

/* ------------------------------ submissions (§4.5c, F-1, C-1, D-2) ------------------------------ */
function handleSubmissions_(e) {
  var p = e.parameter || {};
  var page = Math.max(1, parseInt(p.page, 10) || 1);
  var limit = Math.max(1, parseInt(p.limit, 10) || 25);
  var q = String(p.q || '').trim().toLowerCase();
  var status = String(p.status || 'All');
  var type = String(p.type || 'All');
  var project = String(p.project || 'All');
  var from = toDate_(p.from);
  var to = toDate_(p.to);
  if (to) { to = new Date(to.getTime() + 86399999); }
  var hasMin = (p.min != null && String(p.min) !== '');
  var hasMax = (p.max != null && String(p.max) !== '');
  var minAmt = hasMin ? parseAmount(p.min) : null;
  var maxAmt = hasMax ? parseAmount(p.max) : null;
  var sort = String(p.sort || 'date');
  var dir = (String(p.dir || 'desc').toLowerCase() === 'asc') ? 1 : -1;
  var fy = String(p.fy || '');   // '' = current FY, 'all' = every year (D-2 scoping)

  var all = _buildAllSubmissions_(fy);

  // Distinct status/project options for the toolbar (from the scoped set, pre-filter).
  var statusSet = {}, projectSet = {};
  for (var s = 0; s < all.length; s++) {
    if (all[s].status) { statusSet[all[s].status] = 1; }
    if (all[s].project) { projectSet[all[s].project] = 1; }
  }

  var filtered = [];
  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    if (status !== 'All' && r.status !== status) { continue; }
    if (type !== 'All' && r.type !== type) { continue; }
    if (project !== 'All' && r.project !== project) { continue; }
    if (from && r.dateTs && r.dateTs < from.getTime()) { continue; }
    if (to && r.dateTs && r.dateTs > to.getTime()) { continue; }
    if (minAmt !== null && r.amount < minAmt) { continue; }
    if (maxAmt !== null && r.amount > maxAmt) { continue; }
    if (q) {
      var hay = (r.name + ' ' + r.vendor + ' ' + r.description + ' ' + r.id + ' ' + r.email).toLowerCase();
      if (hay.indexOf(q) === -1) { continue; }
    }
    filtered.push(r);
  }

  // Server-side sort (must be server-side because pagination is server-side).
  function sortKey(rec) {
    switch (sort) {
      case 'amount': return rec.amount;
      case 'name': return String(rec.name || '').toLowerCase();
      case 'vendor': return String(rec.vendor || '').toLowerCase();
      case 'project': return String(rec.project || '').toLowerCase();
      case 'status': return String(rec.status || '').toLowerCase();
      case 'type': return String(rec.type || '').toLowerCase();
      default: return rec.dateTs;   // 'date'
    }
  }
  filtered.sort(function (a, b) {
    var ka = sortKey(a), kb = sortKey(b);
    if (ka < kb) { return -1 * dir; }
    if (ka > kb) { return 1 * dir; }
    return 0;
  });

  var total = filtered.length;
  var totalPages = Math.max(1, Math.ceil(total / limit));
  var startIdx = (page - 1) * limit;
  return {
    ok: true, page: page, limit: limit, total: total, totalPages: totalPages,
    records: filtered.slice(startIdx, startIdx + limit),
    sort: sort, dir: (dir === 1 ? 'asc' : 'desc'),
    fyScope: (fy === 'all') ? 'all' : (fy ? resolveFyLabel_(fy) : currentFiscalYearLabel()),
    statusOptions: _sortedKeys_(statusSet), projectOptions: _sortedKeys_(projectSet)
  };
}

function _sortedKeys_(obj) {
  var arr = [];
  for (var k in obj) { if (obj.hasOwnProperty(k)) { arr.push(k); } }
  arr.sort();
  return arr;
}

/**
 * Unified All-Submissions list (AQ not-moved + Expenses + Mileage not-moved).
 * FY-scoped (D-2): the historical Expenses ledger is bounded to `fyFilter`
 * (default current FY; 'all' = every year). Active AQ/Mileage pending items are
 * always included when viewing the current FY or 'all'. Cached 30s per scope.
 */
function _buildAllSubmissions_(fyFilter) {
  var scope = (fyFilter === 'all') ? 'all' : (fyFilter ? resolveFyLabel_(fyFilter) : currentFiscalYearLabel());
  var cache = CacheService.getScriptCache();
  var cacheKey = 'subs_' + scope;
  var cached = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch (ce) {} }

  var includePending = (scope === 'all' || scope === currentFiscalYearLabel());
  var out = [];

  var exp = getSheet_(SHEETS.EXPENSES), eL = exp.getLastRow();
  if (eL >= 2) {
    var ev = exp.getRange(2, 1, eL - 1, COLS.EXP.WIDTH).getValues();
    for (var i = 0; i < ev.length; i++) {
      if (scope !== 'all' && _expRowFy_(ev[i]) !== scope) { continue; }   // FY scope (D-2)
      var ts = toDate_(ev[i][COLS.EXP.TIMESTAMP - 1]);
      var amt = parseAmount(ev[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
      out.push({ id: ev[i][COLS.EXP.ROW_ID - 1], type: String(ev[i][COLS.EXP.EXPENSE_TYPE - 1] || 'Receipt'),
        name: String(ev[i][COLS.EXP.FULL_NAME - 1] || ''), email: String(ev[i][COLS.EXP.EMAIL - 1] || ''),
        vendor: String(ev[i][COLS.EXP.VENDOR - 1] || ''), description: String(ev[i][COLS.EXP.DESCRIPTION - 1] || ''),
        amount: amt, amountDisplay: formatCAD(amt), status: String(ev[i][COLS.EXP.REIMB_STATUS - 1] || ''),
        project: String(ev[i][COLS.EXP.STD_PROJECT - 1] || ''), crNumber: String(ev[i][COLS.EXP.CR_NUMBER - 1] || ''),
        date: ts ? formatDate(ts) : '', dateTs: ts ? ts.getTime() : 0, source: 'Expenses' });
    }
  }
  if (includePending) {
    var aq = getSheet_(SHEETS.APPROVAL_QUEUE), aL = aq.getLastRow();
    if (aL >= 2) {
      var av = aq.getRange(2, 1, aL - 1, COLS.AQ.WIDTH).getValues();
      for (var j = 0; j < av.length; j++) {
        var ast = String(av[j][COLS.AQ.APPROVAL_STATUS - 1] || 'Pending');
        if (ast === 'Moved to Expenses') { continue; }
        var ats = toDate_(av[j][COLS.AQ.TIMESTAMP - 1]);
        var aamt = coalesceAmount(av[j][COLS.AQ.VERIFIED_AMOUNT - 1], av[j][COLS.AQ.AMOUNT - 1]);
        out.push({ id: av[j][COLS.AQ.ROW_ID - 1], type: 'Receipt', name: String(av[j][COLS.AQ.FULL_NAME - 1] || ''),
          email: String(av[j][COLS.AQ.EMAIL - 1] || ''), vendor: String(av[j][COLS.AQ.VENDOR - 1] || ''),
          description: String(av[j][COLS.AQ.DESCRIPTION - 1] || ''), amount: aamt, amountDisplay: formatCAD(aamt),
          status: ast, project: String(av[j][COLS.AQ.STD_PROJECT - 1] || av[j][COLS.AQ.EVENT_SUBMITTED - 1] || ''),
          crNumber: '', date: ats ? formatDate(ats) : '', dateTs: ats ? ats.getTime() : 0, source: 'Approval Queue' });
      }
    }
    var mi = getSheet_(SHEETS.MILEAGE_APPROVALS), mL = mi.getLastRow();
    if (mL >= 2) {
      var mv = mi.getRange(2, 1, mL - 1, COLS.MILEAGE.WIDTH).getValues();
      for (var k = 0; k < mv.length; k++) {
        var mst = String(mv[k][COLS.MILEAGE.STATUS - 1] || 'Pending');
        if (mst === 'Moved to Expenses') { continue; }
        var mts = toDate_(mv[k][COLS.MILEAGE.TIMESTAMP - 1]);
        var mamt = parseAmount(mv[k][COLS.MILEAGE.PAYOUT - 1]);
        out.push({ id: mv[k][COLS.MILEAGE.ROW_ID - 1], type: 'Mileage', name: String(mv[k][COLS.MILEAGE.FULL_NAME - 1] || ''),
          email: String(mv[k][COLS.MILEAGE.EMAIL - 1] || ''), vendor: 'Mileage Reimbursement',
          description: 'Mileage ' + parseAmount(mv[k][COLS.MILEAGE.DISTANCE - 1]) + 'km', amount: mamt,
          amountDisplay: formatCAD(mamt), status: mst, project: String(mv[k][COLS.MILEAGE.EVENT - 1] || ''),
          crNumber: '', date: mts ? formatDate(mts) : '', dateTs: mts ? mts.getTime() : 0, source: 'Mileage' });
      }
    }
  }
  out.sort(function (a, b) { return b.dateTs - a.dateTs; });
  try { cache.put(cacheKey, JSON.stringify(out), 30); } catch (pe) {}   // best-effort; skip if >100KB
  return out;
}

/* ------------------------------ report (§5.15, §5.17 union) ------------------------------ */
function handleReport_(e) {
  var p = e.parameter || {};
  var type = String(p.type || 'monthly');
  var liveStart = _liveWindowStartYear_();
  var needsArchive = false, fyLabel = '';

  if (type === 'event' || type === 'grant') { needsArchive = true; }
  else if (type === 'monthly' && p.month) { needsArchive = (fiscalYearForDate(new Date(p.month + '-01')).startYear < liveStart); }
  else if (type === 'term' && p.start) { needsArchive = (fiscalYearForDate(new Date(p.start)).startYear < liveStart); }
  else if (type === 'yearend') {
    fyLabel = resolveFyLabel_(p.fy);
    var fyStartYear = parseInt((fyLabel.match(/\d{4}/) || ['0'])[0], 10);   // "FY 2025–2026" → 2025
    needsArchive = (fyStartYear > 0 && fyStartYear < liveStart);
  }

  var rows = _reportSourceRows_(needsArchive);
  var matched = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[COLS.EXP.REIMB_STATUS - 1] || '').trim() === _REJECTED) { continue; }
    if (_reportMatch_(type, p, r, fyLabel)) { matched.push(r); }
  }

  var report = { ok: true, type: type, filter: _reportFilterLabel_(type, p, fyLabel), summary: _reportSummary_(matched) };
  if (type === 'grant' && p.grant) { report.grant = _grantInfo_(p.grant); }
  return report;
}

function _reportSourceRows_(needsArchive) {
  var rows = [];
  function read(sheetName) {
    var sh = getSheet_(sheetName), last = sh.getLastRow();
    if (last >= 2) { var v = sh.getRange(2, 1, last - 1, COLS.EXP.WIDTH).getValues(); for (var i = 0; i < v.length; i++) { rows.push(v[i]); } }
  }
  read(SHEETS.EXPENSES);
  if (needsArchive) { read(SHEETS.ARCHIVE); }
  return rows;
}

function _reportMatch_(type, p, r, fyLabel) {
  var pd = toDate_(r[COLS.EXP.PURCHASE_DATE - 1]);
  if (type === 'monthly') { return pd && monthKey(pd) === String(p.month || ''); }
  if (type === 'event') { return String(r[COLS.EXP.STD_PROJECT - 1] || '') === String(p.project || ''); }
  if (type === 'grant') { return String(r[COLS.EXP.FUNDING_SOURCE - 1] || '') === String(p.grant || ''); }
  if (type === 'term') {
    if (!pd) { return false; }
    var s = toDate_(p.start), en = toDate_(p.end);
    if (en) { en = new Date(en.getTime() + 86399999); }
    return (!s || pd.getTime() >= s.getTime()) && (!en || pd.getTime() <= en.getTime());
  }
  if (type === 'yearend') { return _expRowFy_(r) === (fyLabel || currentFiscalYearLabel()); }
  return false;
}

function _reportSummary_(rows) {
  var total = 0, cat = {}, byStatus = {};
  for (var i = 0; i < rows.length; i++) {
    var amt = parseAmount(rows[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
    total += amt;
    var c = String(rows[i][COLS.EXP.CATEGORY - 1] || 'Uncategorized');
    cat[c] = (cat[c] || 0) + amt;
    var st = String(rows[i][COLS.EXP.REIMB_STATUS - 1] || 'Approved');
    if (!byStatus[st]) { byStatus[st] = { count: 0, total: 0 }; }
    byStatus[st].count++; byStatus[st].total += amt;
  }
  var catArr = [], stArr = [];
  for (var k in cat) { if (cat.hasOwnProperty(k)) { catArr.push({ label: k, value: roundMoney(cat[k]) }); } }
  for (var s in byStatus) { if (byStatus.hasOwnProperty(s)) { stArr.push({ status: s, count: byStatus[s].count, total: roundMoney(byStatus[s].total), totalDisplay: formatCAD(byStatus[s].total) }); } }
  catArr.sort(function (a, b) { return b.value - a.value; });
  return { total: roundMoney(total), totalDisplay: formatCAD(total), count: rows.length, byCategory: catArr, byStatus: stArr };
}

function _reportFilterLabel_(type, p, fyLabel) {
  if (type === 'monthly') { return 'Month: ' + (p.month || ''); }
  if (type === 'event') { return 'Project: ' + (p.project || ''); }
  if (type === 'grant') { return 'Grant: ' + (p.grant || ''); }
  if (type === 'term') { return 'Term: ' + (p.start || '') + ' to ' + (p.end || ''); }
  return 'Fiscal Year: ' + (fyLabel || currentFiscalYearLabel());
}

function _grantInfo_(grantName) {
  var row = findRowByValue_(SHEETS.GRANTS, COLS.GRANT.GRANT_NAME, grantName);
  if (!row) { return null; }
  var g = getSheet_(SHEETS.GRANTS).getRange(row, 1, 1, COLS.GRANT.WIDTH).getValues()[0];
  return {
    name: grantName, requested: parseAmount(g[COLS.GRANT.AMT_REQUESTED - 1]),
    approved: parseAmount(g[COLS.GRANT.AMT_APPROVED - 1]),
    appealApproved: parseAmount(g[COLS.GRANT.APPEAL_AMT_APPROVED - 1]),
    spent: parseAmount(g[COLS.GRANT.AMT_SPENT - 1]), remaining: parseAmount(g[COLS.GRANT.AMT_REMAINING - 1]),
    utilization: String(g[COLS.GRANT.UTILIZATION - 1] || ''), status: String(g[COLS.GRANT.STATUS - 1] || '')
  };
}

/* ------------------------------ yearend + budgetImpact ------------------------------ */
function handleYearEnd_(e) { return { ok: true, checklist: computeYearEndChecklist_() }; }

function handleBudgetImpact_(e) {
  var p = e.parameter || {};
  return { ok: true, impact: computeBudgetImpact_(p.project, p.amount) };
}
