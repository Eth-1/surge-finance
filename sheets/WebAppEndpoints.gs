/**
 * ============================================================================
 * WebAppEndpoints.gs — health, authCheck, status (§6.1, §1.6, §4.4)
 * ============================================================================
 * Public endpoints (no token). authCheck is rate-limited and never reflects the
 * password. status is email-gated (normalized X2), unions AQ+Expenses+Mileage
 * with the §4.4 field-exposure rules, supports deep-link id ownership (S3), and
 * is protected by a 60s per-email cache + the status circuit breaker (§6.6).
 * ES5-compatible.
 * ============================================================================
 */

/* ------------------------------ health (C4) ------------------------------ */
function handleHealth_() {
  var lastRefresh = '';
  try { lastRefresh = getDashboardCache_('lastRefresh') || ''; } catch (e) {}
  return { status: 'ok', lastRefresh: lastRefresh, sheetId: getSs_().getId(), version: WEBAPP_VERSION };
}

/* ------------------------------ authCheck (§1.6) ------------------------------ */
function handleAuthCheck_(e) {
  if (!checkAuthRateLimit(getClientIp_(e))) { return { error: 'rate_limited' }; }
  var pw = (e.parameter && e.parameter.password) ? e.parameter.password : postBody_(e).password;
  if (verifyPassword(pw)) { return { ok: true, token: signToken(), expiresInDays: getCfg().tokenExpiryDays }; }
  return { error: 'unauthorized' };   // never reflect the submitted password
}

/* ------------------------------ status (§4.4, X2, S3, §6.6) ------------------------------ */
function handleStatus_(e) {
  if (!getCfg().selfServiceEnabled) { return { disabled: true }; }
  if (!checkStatusCircuitBreaker()) { return { error: 'rate_limited' }; }

  var email = normalizeEmail(e.parameter && e.parameter.email);
  if (!email) { return { ok: true, email: '', records: [] }; }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'status_' + email;
  var records;
  var cached = cache.get(cacheKey);
  if (cached) {
    records = JSON.parse(cached);
  } else {
    records = _buildStatusRecords_(email);
    try { cache.put(cacheKey, JSON.stringify(records), getCfg().statusCacheSeconds); } catch (x) {}
  }

  // Deep-link id ownership (S3): only echo the id if it belongs to this email.
  var reqId = (e.parameter && e.parameter.id) ? String(e.parameter.id) : '';
  var ownedId = '';
  if (reqId) {
    for (var i = 0; i < records.length; i++) { if (String(records[i].id) === reqId) { ownedId = reqId; break; } }
  }
  return { ok: true, email: email, records: records, requestedId: ownedId };
}

/** Extract the URL from a =HYPERLINK("url",...) formula, or a bare URL value. */
function _hyperlinkUrl_(formula, value) {
  var m = String(formula || '').match(/HYPERLINK\("([^"]+)"/i);
  if (m) { return m[1]; }
  var v = String(value || '');
  return /^https?:\/\//i.test(v) ? v : '';
}

/** Build the unified, field-filtered record list for an email (§4.4 / §2.5). */
function _buildStatusRecords_(email) {
  var out = [];

  // --- Expenses (moved/approved items; authoritative for moved rows) ---
  var exp = getSheet_(SHEETS.EXPENSES), eLast = exp.getLastRow();
  if (eLast >= 2) {
    var ev = exp.getRange(2, 1, eLast - 1, COLS.EXP.WIDTH).getValues();
    var ef = exp.getRange(2, COLS.EXP.RECEIPT_FILE, eLast - 1, 1).getFormulas();
    for (var i = 0; i < ev.length; i++) {
      if (normalizeEmail(ev[i][COLS.EXP.EMAIL - 1]) !== email) { continue; }
      var pd = toDate_(ev[i][COLS.EXP.PURCHASE_DATE - 1]);
      var ts = toDate_(ev[i][COLS.EXP.TIMESTAMP - 1]);
      var amt = parseAmount(ev[i][COLS.EXP.VERIFIED_AMOUNT - 1]);
      out.push({
        id: ev[i][COLS.EXP.ROW_ID - 1], type: String(ev[i][COLS.EXP.EXPENSE_TYPE - 1] || 'Receipt'),
        name: ev[i][COLS.EXP.FULL_NAME - 1], event: ev[i][COLS.EXP.STD_PROJECT - 1],
        vendor: ev[i][COLS.EXP.VENDOR - 1], description: ev[i][COLS.EXP.DESCRIPTION - 1],
        amount: amt, amountDisplay: formatCAD(amt), status: String(ev[i][COLS.EXP.REIMB_STATUS - 1] || ''),
        date: pd ? formatDate(pd) : '', submitted: ts ? formatDate(ts, 'MMM d, yyyy h:mm a') : '',
        submittedTs: ts ? ts.getTime() : 0, crNumber: String(ev[i][COLS.EXP.CR_NUMBER - 1] || ''),
        paymentDate: ev[i][COLS.EXP.PAYMENT_DATE - 1] ? formatDate(ev[i][COLS.EXP.PAYMENT_DATE - 1]) : '',
        paymentMethod: String(ev[i][COLS.EXP.PAYMENT_METHOD - 1] || ''),
        receiptUrl: _hyperlinkUrl_(ef[i][0], ev[i][COLS.EXP.RECEIPT_FILE - 1])
      });
    }
  }

  // --- Approval Queue (not yet moved) ---
  var aq = getSheet_(SHEETS.APPROVAL_QUEUE), aLast = aq.getLastRow();
  if (aLast >= 2) {
    var av = aq.getRange(2, 1, aLast - 1, COLS.AQ.WIDTH).getValues();
    var af = aq.getRange(2, COLS.AQ.RECEIPT_FILE, aLast - 1, 1).getFormulas();
    for (var j = 0; j < av.length; j++) {
      if (normalizeEmail(av[j][COLS.AQ.EMAIL - 1]) !== email) { continue; }
      var status = String(av[j][COLS.AQ.APPROVAL_STATUS - 1] || 'Pending');
      if (status === 'Moved to Expenses') { continue; }      // lives in Expenses now (de-dup)
      var apd = toDate_(av[j][COLS.AQ.PURCHASE_DATE - 1]);
      var ats = toDate_(av[j][COLS.AQ.TIMESTAMP - 1]);
      var aamt = coalesceAmount(av[j][COLS.AQ.VERIFIED_AMOUNT - 1], av[j][COLS.AQ.AMOUNT - 1]);
      var rec = {
        id: av[j][COLS.AQ.ROW_ID - 1], type: 'Receipt', name: av[j][COLS.AQ.FULL_NAME - 1],
        event: av[j][COLS.AQ.EVENT_SUBMITTED - 1], vendor: av[j][COLS.AQ.VENDOR - 1],
        description: av[j][COLS.AQ.DESCRIPTION - 1], amount: aamt, amountDisplay: formatCAD(aamt),
        status: status, date: apd ? formatDate(apd) : '',
        submitted: ats ? formatDate(ats, 'MMM d, yyyy h:mm a') : '', submittedTs: ats ? ats.getTime() : 0,
        crNumber: '', paymentDate: '', paymentMethod: '',
        receiptUrl: _hyperlinkUrl_(af[j][0], av[j][COLS.AQ.RECEIPT_FILE - 1])
      };
      if (status === 'Rejected') { rec.rejectionReason = String(av[j][COLS.AQ.REJECTION_REASON - 1] || ''); }
      out.push(rec);
    }
  }

  // --- Mileage Approvals (not yet moved) ---
  var mi = getSheet_(SHEETS.MILEAGE_APPROVALS), mLast = mi.getLastRow();
  if (mLast >= 2) {
    var mv = mi.getRange(2, 1, mLast - 1, COLS.MILEAGE.WIDTH).getValues();
    var mf = mi.getRange(2, COLS.MILEAGE.FILE_LINK, mLast - 1, 1).getFormulas();
    for (var k = 0; k < mv.length; k++) {
      if (normalizeEmail(mv[k][COLS.MILEAGE.EMAIL - 1]) !== email) { continue; }
      var mstatus = String(mv[k][COLS.MILEAGE.STATUS - 1] || 'Pending');
      if (mstatus === 'Moved to Expenses') { continue; }
      var mdate = toDate_(mv[k][COLS.MILEAGE.DATE_TRAVEL - 1]);
      var mts = toDate_(mv[k][COLS.MILEAGE.TIMESTAMP - 1]);
      var mamt = parseAmount(mv[k][COLS.MILEAGE.PAYOUT - 1]);
      var mrec = {
        id: mv[k][COLS.MILEAGE.ROW_ID - 1], type: 'Mileage', name: mv[k][COLS.MILEAGE.FULL_NAME - 1],
        event: mv[k][COLS.MILEAGE.EVENT - 1], vendor: 'Mileage Reimbursement',
        description: 'Mileage: ' + parseAmount(mv[k][COLS.MILEAGE.DISTANCE - 1]) + 'km @ ' + formatCAD(mv[k][COLS.MILEAGE.RATE - 1]) + '/km',
        amount: mamt, amountDisplay: formatCAD(mamt), status: mstatus,
        date: mdate ? formatDate(mdate) : '', submitted: mts ? formatDate(mts, 'MMM d, yyyy h:mm a') : '',
        submittedTs: mts ? mts.getTime() : 0, crNumber: '', paymentDate: '', paymentMethod: '',
        receiptUrl: _hyperlinkUrl_(mf[k][0], mv[k][COLS.MILEAGE.FILE_LINK - 1]),
        distance: parseAmount(mv[k][COLS.MILEAGE.DISTANCE - 1]), rateApplied: parseAmount(mv[k][COLS.MILEAGE.RATE - 1])
      };
      if (mstatus === 'Rejected') { mrec.reviewNotes = String(mv[k][COLS.MILEAGE.REVIEW_NOTES - 1] || ''); }
      out.push(mrec);
    }
  }

  out.sort(function (a, b) { return b.submittedTs - a.submittedTs; });   // newest first
  return out;
}
