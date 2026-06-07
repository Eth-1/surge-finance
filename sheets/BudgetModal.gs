/**
 * ============================================================================
 * BudgetModal.gs — Budget Impact Preview (§4.5a) + F4 confirm-time recompute
 * ============================================================================
 * showBudgetImpactForMove_(row) opens an HtmlService modal with the budget
 * effect of moving an AQ row. The Confirm button calls confirmBudgetMove()
 * (PUBLIC — google.script.run cannot call underscore-suffixed functions), which
 * recomputes the impact INSIDE the lock before writing (F4 TOCTOU). If the
 * remaining budget changed since the modal opened, the move pauses and the user
 * must confirm again. computeBudgetImpact_() is shared with WebApp (3.7).
 * ES5-compatible.
 * ============================================================================
 */

/**
 * Compute current + after-approval budget impact for a project.
 * @return { hasBudget, allocated, spent, committed, remaining, util,
 *           afterSpent, afterRemaining, afterUtil }
 */
function computeBudgetImpact_(project, amount) {
  var proj = String(project || '').trim();
  var add = parseAmount(amount);
  var crRow = proj ? findRowByValue_(SHEETS.BUDGETS, COLS.BUDGET.PROJECT, proj) : 0;
  if (!crRow) { return { hasBudget: false, addAmount: add }; }

  var cfg = getCfg();
  var bu = getSheet_(SHEETS.BUDGETS);
  var allocated = parseAmount(bu.getRange(crRow, COLS.BUDGET.ALLOCATED).getValue());
  var spent = _spentByProject_()[proj] || 0;
  var committed = _committedByProject_()[proj] || 0;
  var include = cfg.includeCommittedInBudget;

  function remOf(sp) { return include ? (allocated - sp - committed) : (allocated - sp); }
  function utilOf(sp) { return allocated > 0 ? Math.round(((include ? sp + committed : sp) / allocated) * 100) : 0; }

  var afterSpent = spent + add;
  return {
    hasBudget: true, addAmount: add,
    allocated: roundMoney(allocated), spent: roundMoney(spent), committed: roundMoney(committed),
    remaining: roundMoney(remOf(spent)), util: utilOf(spent),
    afterSpent: roundMoney(afterSpent), afterRemaining: roundMoney(remOf(afterSpent)), afterUtil: utilOf(afterSpent)
  };
}

/** Open the Budget Impact modal for an AQ row (called from the menu). */
function showBudgetImpactForMove_(row) {
  var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
  var d = aq.getRange(row, 1, 1, COLS.AQ.WIDTH).getValues()[0];
  if (String(d[COLS.AQ.APPROVAL_STATUS - 1] || '').trim() !== 'Fully Approved') {
    safeToast_('Only Fully Approved rows can be moved.', 'Surge Finance', 5); return;
  }
  var project = String(d[COLS.AQ.STD_PROJECT - 1] || '').trim();
  var category = String(d[COLS.AQ.CATEGORY - 1] || '').trim();
  if (!project || !category) {
    safeToast_('Assign a Project and Category before moving.', 'Surge Finance', 6); return;
  }
  var amount = coalesceAmount(d[COLS.AQ.VERIFIED_AMOUNT - 1], d[COLS.AQ.AMOUNT - 1]);
  var vendor = d[COLS.AQ.VENDOR - 1];
  var impact = computeBudgetImpact_(project, amount);

  try {
    var html = HtmlService.createHtmlOutput(_budgetImpactHtml_(row, project, vendor, amount, impact))
      .setWidth(420).setHeight(impact.hasBudget ? 430 : 240);
    SpreadsheetApp.getUi().showModalDialog(html, 'Budget Impact Preview');
  } catch (e) {
    moveRowToExpenses(row);   // headless fallback — just move
  }
}

/**
 * Confirm handler (PUBLIC, callable by google.script.run). Recomputes inside
 * the lock (F4); if remaining changed vs the snapshot, returns {changed:true}.
 */
function confirmBudgetMove(row, snapshotRemaining) {
  return withLock(function () {
    var aq = getSheet_(SHEETS.APPROVAL_QUEUE);
    var d = aq.getRange(row, 1, 1, COLS.AQ.WIDTH).getValues()[0];
    var project = String(d[COLS.AQ.STD_PROJECT - 1] || '').trim();
    var amount = coalesceAmount(d[COLS.AQ.VERIFIED_AMOUNT - 1], d[COLS.AQ.AMOUNT - 1]);
    var fresh = computeBudgetImpact_(project, amount);

    if (fresh.hasBudget && snapshotRemaining !== null && snapshotRemaining !== 'NA') {
      if (Math.abs(fresh.remaining - Number(snapshotRemaining)) > 0.01) {
        return {
          changed: true,
          oldDisplay: formatCAD(Number(snapshotRemaining)),
          remaining: fresh.remaining, remainingDisplay: formatCAD(fresh.remaining),
          afterRemainingDisplay: formatCAD(fresh.afterRemaining), afterUtil: fresh.afterUtil
        };
      }
    }
    var res = moveRowToExpenses(row);
    return { moved: !!(res && res.moved), reason: (res && res.reason) || '' };
  });
}

/* ------------------------------ HTML ------------------------------ */
function _budgetImpactHtml_(row, project, vendor, amount, impact) {
  var snap = impact.hasBudget ? impact.remaining : 'NA';
  var body = '';
  if (impact.hasBudget) {
    var warn = impact.afterUtil >= getCfg().budgetWarningPercent ? ' ⚠️' : '';
    body =
      '<div class="box"><div class="r"><span>Allocated</span><b>' + formatCAD(impact.allocated) + '</b></div>' +
      '<div class="r"><span>Spent</span><b>' + formatCAD(impact.spent) + '</b></div>' +
      '<div class="r"><span>Committed</span><b>' + formatCAD(impact.committed) + '</b></div>' +
      '<div class="r"><span>Remaining</span><b id="rem">' + formatCAD(impact.remaining) + '</b></div>' +
      '<div class="r"><span>Utilization</span><b>' + impact.util + '%</b></div></div>' +
      '<p class="h">After this approval:</p>' +
      '<div class="box"><div class="r"><span>Spent</span><b>' + formatCAD(impact.afterSpent) +
        ' (+' + formatCAD(impact.addAmount) + ')</b></div>' +
      '<div class="r"><span>Remaining</span><b id="arem">' + formatCAD(impact.afterRemaining) + '</b></div>' +
      '<div class="r"><span>Utilization</span><b id="autil">' + impact.afterUtil + '%' + warn + '</b></div></div>';
  } else {
    body = '<p class="muted">No budget allocated for this project. The move will proceed without a budget impact check.</p>';
  }

  return '' +
    '<style>body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1d27;margin:0;padding:14px}' +
    'h2{font-size:15px;margin:0 0 8px}.h{font-weight:bold;margin:12px 0 4px}.muted{color:#6b7280}' +
    '.box{border:1px solid #e4e7ec;border-radius:8px;padding:8px 10px;background:#f7f8fa}' +
    '.r{display:flex;justify-content:space-between;padding:2px 0}.r span{color:#4b5563}' +
    '#msg{color:#b26a00;margin:8px 0;display:none}' +
    '.btns{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}' +
    'button{padding:7px 14px;border-radius:6px;border:1px solid #d0d5dd;cursor:pointer;font-size:13px}' +
    '#go{background:#6366f1;color:#fff;border-color:#6366f1}</style>' +
    '<h2>' + _esc_(project) + '</h2>' +
    '<p class="muted">Expense: ' + formatCAD(amount) + ' (' + _esc_(vendor || '') + ')</p>' +
    body +
    '<p id="msg"></p>' +
    '<div class="btns"><button onclick="google.script.host.close()">Cancel</button>' +
    '<button id="go" onclick="doMove()">Confirm &amp; Move</button></div>' +
    '<script>var ROW=' + row + ',snap=' + (snap === 'NA' ? '"NA"' : snap) + ';' +
    'function doMove(){var b=document.getElementById("go");b.disabled=true;b.textContent="Working…";' +
    'google.script.run.withSuccessHandler(onRes).withFailureHandler(onErr).confirmBudgetMove(ROW,snap);}' +
    'function onRes(res){var b=document.getElementById("go");' +
    'if(res&&res.changed){snap=res.remaining;' +
    'var m=document.getElementById("msg");m.style.display="block";' +
    'm.textContent="Budget changed since you opened this — remaining is now "+res.remainingDisplay+" (was "+res.oldDisplay+"). Review and confirm again.";' +
    'if(document.getElementById("rem"))document.getElementById("rem").textContent=res.remainingDisplay;' +
    'if(document.getElementById("arem"))document.getElementById("arem").textContent=res.afterRemainingDisplay;' +
    'if(document.getElementById("autil"))document.getElementById("autil").textContent=res.afterUtil+"%";' +
    'b.disabled=false;b.textContent="Confirm \\u0026 Move";return;}' +
    'google.script.host.close();}' +
    'function onErr(e){var b=document.getElementById("go");b.disabled=false;b.textContent="Confirm \\u0026 Move";' +
    'var m=document.getElementById("msg");m.style.display="block";m.textContent="Error: "+e.message;}<\/script>';
}
