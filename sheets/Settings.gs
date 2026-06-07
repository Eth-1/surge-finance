/**
 * ============================================================================
 * Settings.gs — list rename / delete cascade (§4.5j / E4, S5, S6)
 * ============================================================================
 * onEdit on the Settings sheet detects a rename (old→new) or delete (old→blank)
 * of a configurable-list value (col B) and offers to cascade across referencing
 * sheets. Adding an item needs nothing (named ranges auto-include it).
 *
 * S6 note: all FK dropdowns are built with allowInvalid:true, so orphaned legacy
 * values never show the "red corner" invalid flag — "keep as orphan" therefore
 * needs no validation rebuild. We still record the choice in the Audit Log.
 * ES5-compatible.
 * ============================================================================
 */

function handleSettingsEdit_(e, info) {
  clearSettingsCache();   // any Settings change must invalidate the memo

  // Only single-cell edits in the value column (B) can be a list rename/delete.
  if (info.startCol !== COLS.SETTINGS.VALUE || info.numRows !== 1 || info.numCols !== 1) { return; }
  var row = info.startRow;
  var listName = _identifyListAtRow_(row);
  if (!listName) { return; }                 // key-value setting or header — nothing to cascade

  var targets = _refTargetsForList_(listName);
  if (!targets.length) { return; }           // list with no FK references (e.g. statuses)

  var oldVal = (e.oldValue == null) ? '' : String(e.oldValue).trim();
  var newVal = (e.value == null) ? '' : String(e.value).trim();

  if (!oldVal) { return; }                   // addition — named range auto-includes it
  if (oldVal === newVal) { return; }

  var count = _countReferences_(targets, oldVal);

  if (newVal) {
    // ---- RENAME (old → new) ----
    if (count > 0) {
      if (_confirm_('Rename list value',
          'Found ' + count + ' row(s) referencing "' + oldVal + '". Rename all to "' + newVal + '"?')) {
        var changed = _cascadeRename_(targets, oldVal, newVal);
        if (listName === 'FundingSources') { _renameCRFSHeader_(oldVal, newVal); }
        logToAudit('SETTING_RENAME_CASCADE', { sheet: SHEETS.SETTINGS, recordId: listName,
          oldValue: oldVal, newValue: newVal, details: changed + ' rows updated' });
        safeToast_('Renamed ' + changed + ' reference(s) to "' + newVal + '".', 'Surge Finance', 5);
      } else {
        logToAudit('SETTING_RENAME_CASCADE', { sheet: SHEETS.SETTINGS, recordId: listName,
          oldValue: oldVal, newValue: newVal, details: 'declined — existing rows keep "' + oldVal + '"' });
      }
    }
    return;
  }

  // ---- DELETE (old → blank) ----
  if (count === 0) { return; }               // no references — deletion proceeds silently
  var choice = _ask3_('Delete list value',
    count + ' row(s) still reference "' + oldVal + '". Deleting orphans them.\n\n' +
    'Yes = Reassign to another value\nNo = Keep value (orphan, allowed)\nCancel = Undo deletion');

  if (choice === 'reassign') {
    var replacement = _prompt_('Reassign "' + oldVal + '"', 'Enter the replacement value:');
    if (replacement) {
      var n = _cascadeRename_(targets, oldVal, replacement);
      if (listName === 'FundingSources') { _renameCRFSHeader_(oldVal, replacement); }
      logToAudit('SETTING_DELETE', { sheet: SHEETS.SETTINGS, recordId: listName, oldValue: oldVal,
        newValue: replacement, details: 'reassigned ' + n + ' rows' });
      safeToast_('Reassigned ' + n + ' row(s) from "' + oldVal + '" to "' + replacement + '".', 'Surge Finance', 5);
    } else {
      _restoreCell_(row, oldVal);            // no replacement given → undo to be safe
    }
  } else if (choice === 'orphan') {
    // allowInvalid:true means existing rows are not flagged invalid (S6 satisfied).
    logToAudit('SETTING_DELETE', { sheet: SHEETS.SETTINGS, recordId: listName, oldValue: oldVal,
      newValue: '', details: count + ' rows kept as orphans (value retained in cells)' });
    safeToast_('"' + oldVal + '" removed from the list; ' + count + ' existing row(s) keep the value.', 'Surge Finance', 6);
  } else {
    _restoreCell_(row, oldVal);              // cancel → undo deletion
    safeToast_('Deletion cancelled — "' + oldVal + '" restored.', 'Surge Finance', 4);
  }
}

/* ------------------------------ helpers ------------------------------ */

/** Identify the list whose value-block contains `row` (scan col A upward for "LIST: "). */
function _identifyListAtRow_(row) {
  var sh = getSheet_(SHEETS.SETTINGS);
  var colA = sh.getRange(1, 1, row, 1).getValues();
  for (var r = row - 1; r >= 0; r--) {
    var v = String(colA[r][0] || '');
    if (v.indexOf('LIST: ') === 0) { return v.substring(6).trim(); }
    if (v.indexOf('CONFIGURABLE LISTS') === 0) { return ''; }   // hit the section title — above lists
  }
  return '';
}

/** FK reference targets per list as [sheetName, col]. Lists not listed → no cascade. */
function _refTargetsForList_(listName) {
  if (listName === 'ProjectNames') {
    return [[SHEETS.APPROVAL_QUEUE, COLS.AQ.STD_PROJECT], [SHEETS.EXPENSES, COLS.EXP.STD_PROJECT], [SHEETS.BUDGETS, COLS.BUDGET.PROJECT]];
  }
  if (listName === 'ExpenseCategories') {
    return [[SHEETS.APPROVAL_QUEUE, COLS.AQ.CATEGORY], [SHEETS.EXPENSES, COLS.EXP.CATEGORY]];
  }
  if (listName === 'FundingSources') {
    return [[SHEETS.EXPENSES, COLS.EXP.FUNDING_SOURCE], [SHEETS.GRANTS, COLS.GRANT.GRANT_NAME]];
  }
  return [];
}

function _countReferences_(targets, value) {
  var total = 0;
  for (var t = 0; t < targets.length; t++) {
    var sh = getSheet_(targets[t][0]);
    var last = sh.getLastRow();
    if (last < 2) { continue; }
    var vals = sh.getRange(2, targets[t][1], last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === value) { total++; }
    }
  }
  return total;
}

function _cascadeRename_(targets, oldV, newV) {
  var changed = 0;
  for (var t = 0; t < targets.length; t++) {
    var sh = getSheet_(targets[t][0]);
    var last = sh.getLastRow();
    if (last < 2) { continue; }
    var col = targets[t][1];
    var rng = sh.getRange(2, col, last - 1, 1);
    var vals = rng.getValues();
    var dirty = false;
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === oldV) { vals[i][0] = newV; changed++; dirty = true; }
    }
    if (dirty) { rng.setValues(vals); }
  }
  return changed;
}

/** Rename a CR Tracker "FS: {old}" funding-source column header to the new name. */
function _renameCRFSHeader_(oldV, newV) {
  var cr = getSheet_(SHEETS.CR_TRACKER);
  var lastCol = cr.getLastColumn();
  var headers = cr.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]) === 'FS: ' + oldV) { cr.getRange(1, i + 1).setValue('FS: ' + newV); return; }
  }
}

function _restoreCell_(row, value) {
  getSheet_(SHEETS.SETTINGS).getRange(row, COLS.SETTINGS.VALUE).setValue(value);
}

/* ---- UI wrappers (safe in headless contexts) ---- */
function _confirm_(title, msg) {
  try {
    var ui = SpreadsheetApp.getUi();
    return ui.alert(title, msg, ui.ButtonSet.YES_NO) === ui.Button.YES;
  } catch (e) { return false; }   // headless → conservative "no"
}

/** Returns 'reassign' | 'orphan' | 'cancel'. Headless default: 'orphan' (no data loss). */
function _ask3_(title, msg) {
  try {
    var ui = SpreadsheetApp.getUi();
    var r = ui.alert(title, msg, ui.ButtonSet.YES_NO_CANCEL);
    if (r === ui.Button.YES) { return 'reassign'; }
    if (r === ui.Button.NO) { return 'orphan'; }
    return 'cancel';
  } catch (e) { return 'orphan'; }
}

function _prompt_(title, msg) {
  try {
    var ui = SpreadsheetApp.getUi();
    var r = ui.prompt(title, msg, ui.ButtonSet.OK_CANCEL);
    return (r.getSelectedButton() === ui.Button.OK) ? String(r.getResponseText()).trim() : '';
  } catch (e) { return ''; }
}
