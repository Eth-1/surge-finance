/**
 * ============================================================================
 * SFU Surge Finance Dashboard V2.2 — Google Sheets Bootstrap
 * ============================================================================
 * Programmatically (re)creates the ENTIRE workbook schema from scratch:
 *   - all 13 sheets (Settings, Approval Queue, Mileage Approvals, Expenses,
 *     CR Tracker, Grants, Budgets, Reconciliation, Audit Log, Dashboard Data,
 *     Form Responses 1/2, Archive)
 *   - exact column headers (§2)
 *   - color-coded header groups (§2.4 / §2.5)
 *   - data-validation rules (dropdowns, toggles) wired to named ranges
 *   - inline formulas (duplicate flag, status age, funding total check, etc.)
 *   - conditional formatting rules (§4.2)
 *   - named ranges list_{ListName} for every configurable list (§2.12)
 *
 * USAGE:  Run buildAll() once from the Apps Script editor on a fresh spreadsheet.
 *         Safe to re-run: existing sheets are cleared and rebuilt in place.
 *
 * STYLE:  ES5-compatible (no arrow fns / optional chaining / let-const-only).
 *         Helper functions end in "_" to keep them out of the public surface.
 *
 * NOTE:   Form Responses 1 & 2 are normally auto-created by Google Forms. This
 *         script creates header-only stand-ins so the schema is complete even
 *         before the Forms are linked (§2.2 / §2.3). Do NOT delete the real
 *         Form Responses sheets once the Forms are attached.
 * ============================================================================
 */

/* ------------------------------------------------------------------ *
 * Sheet name constants (must match Config.gs SHEETS map in Phase 2)  *
 * ------------------------------------------------------------------ */
var BS_SHEETS = {
  SETTINGS:           'Settings',
  APPROVAL_QUEUE:     'Approval Queue',
  MILEAGE_APPROVALS:  'Mileage Approvals',
  EXPENSES:           'Expenses',
  CR_TRACKER:         'CR Tracker',
  GRANTS:             'Grants',
  BUDGETS:            'Budgets',
  RECONCILIATION:     'Reconciliation',
  AUDIT_LOG:          'Audit Log',
  DASHBOARD_DATA:     'Dashboard Data',
  FORM_RESPONSES:     'Form Responses 1',
  MILEAGE_RESPONSES:  'Form Responses 2',
  ARCHIVE:            'Archive'
};

/* Display order (§2 Sheet Registry) */
var BS_SHEET_ORDER = [
  BS_SHEETS.SETTINGS, BS_SHEETS.APPROVAL_QUEUE, BS_SHEETS.MILEAGE_APPROVALS,
  BS_SHEETS.EXPENSES, BS_SHEETS.CR_TRACKER, BS_SHEETS.GRANTS, BS_SHEETS.BUDGETS,
  BS_SHEETS.RECONCILIATION, BS_SHEETS.AUDIT_LOG, BS_SHEETS.DASHBOARD_DATA,
  BS_SHEETS.FORM_RESPONSES, BS_SHEETS.MILEAGE_RESPONSES, BS_SHEETS.ARCHIVE
];

/* Header-group background colors (§2.4 / §2.5) */
var BS_COLOR = {
  BLUE:   '#1565c0',   // form data
  PURPLE: '#6a1b9a',   // auto-detected
  GREEN:  '#2e7d32',   // finance team
  TEAL:   '#00695c',   // mileage review
  GRAY:   '#424242',   // system / hidden
  HEADER_TEXT: '#ffffff'
};

/* Status conditional-formatting palette (§4.2 / §4.8 / §5.9) */
var BS_FMT = {
  GREEN_BG:   '#D4EDDA',   // Fully Approved / approved
  AMBER_BG:   '#FFE0B2',   // Follow Up / Action Required / budget warning
  RED_BG:     '#F8D7DA',   // critical / over budget
  GRAY_BG:    '#E0E0E0',   // Rejected / Cancelled
  PURPLE_BG:  '#E1BEE7',   // duplicate row
  SKIP_BG:    '#FFF3CD',   // batch-move skipped (temporary)
  ACCENT_GRN: '#2e7d32'    // 4px left border on Fully Approved (D2)
};

/* ------------------------------------------------------------------ *
 * ENTRY POINT                                                         *
 * ------------------------------------------------------------------ */
function buildAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];

  // Phase 1.2 / 1.3
  buildSettingsSheet_(ss);            log.push('Settings');
  buildSettingsLists_(ss);            log.push('Settings lists + named ranges');
  // Phase 1.4 – 1.12
  buildApprovalQueueSheet_(ss);       log.push('Approval Queue');
  buildMileageApprovalsSheet_(ss);    log.push('Mileage Approvals');
  buildExpensesSheet_(ss);            log.push('Expenses');
  buildCRTrackerSheet_(ss);           log.push('CR Tracker');
  buildGrantsSheet_(ss);              log.push('Grants');
  buildBudgetsSheet_(ss);             log.push('Budgets');
  buildReconciliationSheet_(ss);      log.push('Reconciliation');
  buildAuditLogSheet_(ss);            log.push('Audit Log');
  buildDashboardDataSheet_(ss);       log.push('Dashboard Data');
  buildArchiveSheet_(ss);             log.push('Archive');
  buildFormResponseStubs_(ss);        log.push('Form Responses 1 & 2 (stubs)');
  // Phase 1.13
  applyAllConditionalFormatting_(ss); log.push('Conditional formatting');

  reorderSheets_(ss, BS_SHEET_ORDER);
  verifySchema_(ss);

  SpreadsheetApp.getActive().toast('Bootstrap complete: ' + log.length + ' steps.', 'Surge Finance', 8);
  Logger.log('buildAll complete — ' + log.join(', '));
}

/* ------------------------------------------------------------------ *
 * GENERIC SHEET HELPERS                                               *
 * ------------------------------------------------------------------ */

/** Get a sheet by name, creating it if missing, then clear it for a rebuild. */
function getOrCreateSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  } else {
    sh.clear();
    sh.clearConditionalFormatRules();
    sh.getDataRange().clearDataValidations();
    if (sh.getFrozenRows() > 0) { sh.setFrozenRows(0); }
    if (sh.getFrozenColumns() > 0) { sh.setFrozenColumns(0); }
  }
  return sh;
}

/** Write a header row (row 1) and return the header range. */
function setHeaders_(sh, headers) {
  var rng = sh.getRange(1, 1, 1, headers.length);
  rng.setValues([headers]);
  rng.setFontWeight('bold').setFontColor(BS_COLOR.HEADER_TEXT);
  rng.setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 34);
  return rng;
}

/**
 * Color a contiguous header column group.
 * @param startCol 1-based first column, endCol inclusive, bg hex.
 */
function setHeaderColors_(sh, startCol, endCol, bg) {
  var n = endCol - startCol + 1;
  sh.getRange(1, startCol, 1, n).setBackground(bg);
}

/** Freeze header row and (optionally) hide a list of 1-based column indices. */
function freezeAndHide_(sh, freezeRows, hiddenCols) {
  if (freezeRows > 0) { sh.setFrozenRows(freezeRows); }
  if (hiddenCols && hiddenCols.length) {
    for (var i = 0; i < hiddenCols.length; i++) {
      sh.hideColumns(hiddenCols[i]);
    }
  }
}

/**
 * Apply a dropdown (list) data validation to a column body (row 2 → maxRows).
 * source can be an array of literals OR a named-range A1 string (use sourceRange).
 */
function applyListValidation_(sh, col, values, allowInvalid, maxRows) {
  var rows = maxRows || 2000;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(allowInvalid ? true : false)
    .build();
  sh.getRange(2, col, rows, 1).setDataValidation(rule);
}

/** Apply a dropdown validation sourced from an on-sheet range (for named lists). */
function applyRangeValidation_(sh, col, sourceRange, allowInvalid, maxRows) {
  var rows = maxRows || 2000;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(allowInvalid ? true : false)
    .build();
  sh.getRange(2, col, rows, 1).setDataValidation(rule);
}

/** Set a per-row formula down a column using {row} token substitution. */
function setColumnFormula_(sh, col, template, fromRow, toRow) {
  for (var r = fromRow; r <= toRow; r++) {
    var f = template.replace(/\{row\}/g, String(r));
    sh.getRange(r, col).setFormula(f);
  }
}

/** Apply a number format to a column body. */
function setColumnFormat_(sh, col, fmt, maxRows) {
  var rows = maxRows || 2000;
  sh.getRange(2, col, rows, 1).setNumberFormat(fmt);
}

/** Move sheets into the canonical display order (left → right). */
function reorderSheets_(ss, orderedNames) {
  for (var i = 0; i < orderedNames.length; i++) {
    var sh = ss.getSheetByName(orderedNames[i]);
    if (sh) {
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(i + 1);
    }
  }
}

/* ================================================================== *
 * PHASE 1.2 — SETTINGS SHEET (key-value section, cols A–E) §2.12      *
 * ------------------------------------------------------------------ *
 * Column A "Setting" is the canonical lookup key used by             *
 * getSettingValue() in Config.gs. Values consolidate §2.12 and the   *
 * full §6.6 defaults table. Toggle settings get a Y/N dropdown;      *
 * the §2.12 dropdown settings get their enumerated lists — both as   *
 * per-row data validations on the Value column (B).                  *
 * ================================================================== */

/** Allowed values for the §2.12 dropdown-typed settings (keyed by Setting name). */
var BS_SETTING_DROPDOWNS = {
  'Approval Mode':              ['Independent', 'Sequential', 'Both Required'],
  'Approval Queue Sort Order':  ['Newest First', 'Oldest First'],
  'Date Format in Filenames':   ['YYYY-MM-DD', 'MM-DD-YYYY', 'DD-MM-YYYY'],
  'Organize by Folders':        ['Flat (all in root)', 'By Fiscal Year', 'By Event/Project', 'By Fiscal Year then Event', 'By Status'],
  'Dashboard Default Date Range': ['Current Fiscal Year', 'Current Term', 'Current Month', 'Last 30 Days', 'Last 90 Days', 'Custom'],
  'Chart Type Preference':      ['Bar', 'Pie', 'Doughnut', 'Stacked Bar'],
  'Follow-Up Check Frequency':  ['Hourly', 'Daily', 'Weekly'],
  'Default Cheque Delivery':    ['Pick up on campus', 'Mail on campus', 'Mail off campus']
};

/**
 * Full key-value settings seed.
 * Each entry: [Setting, Value, Description, Default, Type].
 * Type ∈ {Text, Number, Toggle, Dropdown, Color}.
 */
function bsSettingsRows_() {
  return [
    ['Dashboard Password', 'Spendy-Otter', 'Password for Vercel dashboard pages (all routes except /status). Takes effect on next login. §1.6', 'Spendy-Otter', 'Text'],
    ['MileageStandardRate', 0.22, 'Standard mileage rate (CAD/km). Single source of truth — never hardcoded (F9). §5.1', 0.22, 'Number'],
    ['Approval Mode', 'Sequential', 'How Coordinator (O) + Director (P) approvals combine. §3.3a', 'Sequential', 'Dropdown'],
    ['Auto-Approve Enabled', 'N', 'Master switch for auto-approval. Even with a threshold, nothing fires unless Y. §3.3e', 'N', 'Toggle'],
    ['Auto-Approve Threshold', 0, 'Submissions ≤ this amount skip human review (only when enabled). $0 = disabled. §5.5', 0, 'Number'],
    ['Allow Over Budget Submissions', 'Y', 'Always Y. Over-budget submissions are always allowed; surfaced in preview modal only. §5.8', 'Y', 'Toggle'],
    ['Enable Duplicate Detection', 'Y', 'Advisory duplicate flagging (never auto-rejects). §5.6', 'Y', 'Toggle'],
    ['Duplicate Window Days', 7, 'Time window (days) for duplicate matching. §5.6', 7, 'Number'],
    ['Receipt Age Threshold Days', 2, 'Days before a receipt is flagged as stale. §5.7', 2, 'Number'],
    ['Budget Warning Percent', 75, 'Budget utilization warning threshold (amber). §5.8', 75, 'Number'],
    ['Budget Critical Percent', 90, 'Budget utilization critical threshold (red). §5.8', 90, 'Number'],
    ['Budget Over Limit Percent', 100, 'Utilization ≥ this → status auto-set to Over Budget. §5.8', 100, 'Number'],
    ['Include Committed in Budget Calc', 'N', 'When Y, Committed is subtracted from Remaining. §5.8', 'N', 'Toggle'],
    ['Grant Warning Percent', 80, 'Grant utilization warning threshold (amber). §5.9', 80, 'Number'],
    ['Grant Critical Percent', 95, 'Grant utilization critical threshold (red). §5.9', 95, 'Number'],
    ['Grant Follow-Up Days', 14, 'Days before a grant follow-up flag is raised. §5.10', 14, 'Number'],
    ['Grant Appeal Window Days', 30, 'Appeal window countdown (days). §5.10', 30, 'Number'],
    ['CR Follow-Up Weeks', 3, 'Weeks before a CR follow-up flag is raised. §5.11', 3, 'Number'],
    ['CR Escalation Weeks', 6, 'Weeks before a CR is flagged URGENT. §5.11', 6, 'Number'],
    ['Payment Follow-Up Weeks', 2, 'Weeks before an awaiting-payment expense is flagged. §5.12', 2, 'Number'],
    ['Payment Escalation Weeks', 4, 'Weeks before a payment is escalated. §5.12', 4, 'Number'],
    ['Large Expense Threshold', 500, 'Amount above which an expense counts as "large". §5.12', 500, 'Number'],
    ['Audit Retention Months', 24, 'Months of Audit Log entries to retain. §5.16', 24, 'Number'],
    ['Enable Archiving', 'N', 'When Y, year-end rollover archives prior-FY terminal rows. Never runs silently. §5.17', 'N', 'Toggle'],
    ['Keep Live Fiscal Years', 2, 'FYs kept live in Expenses (current + N−1). §5.17', 2, 'Number'],
    ['Max Expenses Per CR', 0, 'Max expenses groupable into one CR. 0 = unlimited. §5.11', 0, 'Number'],
    ['Fiscal Year Start', 'May 1', 'Fiscal-year start (month + day). §5.4', 'May 1', 'Text'],
    ['Backend Precompute Cadence Minutes', 5, 'refreshDashboardData() cadence (288 runs/day, quota-safe). §6.1', 5, 'Number'],
    ['Vercel ISR Revalidate Seconds', 180, 'Next.js ISR baseline freshness. §6.1', 180, 'Number'],
    ['On-Edit Webhook Debounce Seconds', 30, 'Min seconds between revalidate webhook calls per tag. §6.1/D1', 30, 'Number'],
    ['Status Per-Email Cache Seconds', 60, '/status per-email result cache TTL. §6.6', 60, 'Number'],
    ['Status Edge Rate Limit Per Min', 5, '/status requests per minute per IP. §6.6/S1', 5, 'Number'],
    ['Status Circuit Breaker Per Hour', 800, 'Apps Script hourly budget for status executions. §6.6', 800, 'Number'],
    ['AuthCheck Rate Limit Per Min', 5, 'authCheck attempts per minute per IP (brute-force guard). §1.6', 5, 'Number'],
    ['Dashboard Token Expiry Days', 7, 'Lifetime of the signed dashboard token. §1.6/X5', 7, 'Number'],
    ['Activity Feed Count', 15, 'Recent activity entries shown on the dashboard. §5.16', 15, 'Number'],
    ['Follow-Up Check Frequency', 'Daily', 'Cadence for time-driven follow-up checks. §3.9', 'Daily', 'Dropdown'],
    ['Self-Service Enabled', 'Y', 'Public /status lookup enabled. §4.4', 'Y', 'Toggle'],
    ['Show Denied Grants', 'Y', 'Show denied grants on the dashboard. §5.10', 'Y', 'Toggle'],
    ['Batch Reimbursement Mode', 'N', 'Batch reimbursement mode. §5.16', 'N', 'Toggle'],
    ['Move Files On Status Change', 'Y', 'Move receipt files between Drive folders on status change. §3.4e', 'Y', 'Toggle'],
    ['Audit Log Edits', 'N', 'Log general cell edits as CELL_EDIT. §3.10', 'N', 'Toggle'],
    ['CR Numbering Format', 'CR-{FY}-{###}', 'CR number template. {FY}=4-digit code, {###}=zero-padded seq. §2.1', 'CR-{FY}-{###}', 'Text'],
    ['CR Numbering Start', 1, 'First CR sequence number per fiscal year. §2.1', 1, 'Number'],
    ['Default Payee', 'Finance Director Name', 'Default Expenses Payee (col R). §2.6', 'Finance Director Name', 'Text'],
    ['Default CR Payee', 'Finance Director Name', 'Default "Cheque Payable To" on new CRs. §2.7', 'Finance Director Name', 'Text'],
    ['Approval Queue Sort Order', 'Newest First', 'Order rows are displayed in the Approval Queue. §2.12', 'Newest First', 'Dropdown'],
    ['Date Format in Filenames', 'YYYY-MM-DD', 'Date format applied when renaming receipt files. §2.12', 'YYYY-MM-DD', 'Dropdown'],
    ['Organize by Folders', 'By Fiscal Year then Event', 'How receipt files are foldered in Drive. §2.12', 'By Fiscal Year then Event', 'Dropdown'],
    ['Dashboard Default Date Range', 'Current Fiscal Year', 'Default scope for KPIs/charts. §2.12', 'Current Fiscal Year', 'Dropdown'],
    ['Chart Type Preference', 'Doughnut', 'Default chart type on the dashboard. §2.12', 'Doughnut', 'Dropdown'],
    ['Default Cheque Delivery', 'Pick up on campus', 'Default delivery method on new CRs. §2.12', 'Pick up on campus', 'Dropdown'],
    ['Receipts Root Folder ID', '', 'Google Drive folder ID where receipt files are organized. §3.3f', '', 'Text'],
    ['Revalidate Webhook URL', '', 'Next.js POST /api/revalidate URL for on-edit tag revalidation. §6.1/D1', '', 'Text']
  ];
}

function buildSettingsSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.SETTINGS);
  var headers = ['Setting', 'Value', 'Description', 'Default', 'Type'];
  setHeaders_(sh, headers);
  setHeaderColors_(sh, 1, headers.length, BS_COLOR.GRAY);

  var rows = bsSettingsRows_();
  sh.getRange(2, 1, rows.length, 5).setValues(rows);

  // Column widths for readability.
  sh.setColumnWidth(1, 240);   // Setting
  sh.setColumnWidth(2, 200);   // Value
  sh.setColumnWidth(3, 460);   // Description
  sh.setColumnWidth(4, 160);   // Default
  sh.setColumnWidth(5, 90);    // Type
  sh.getRange(2, 1, rows.length, 1).setFontWeight('bold');
  sh.getRange(2, 3, rows.length, 1).setFontColor('#6b7280').setWrap(true);
  sh.getRange(2, 4, rows.length, 2).setFontColor('#9aa0a6');

  // Per-row data validation on the Value column (B) by Type.
  for (var i = 0; i < rows.length; i++) {
    var name = rows[i][0];
    var type = rows[i][4];
    var bRow = i + 2;
    if (type === 'Toggle') {
      var ynRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Y', 'N'], true).setAllowInvalid(false).build();
      sh.getRange(bRow, 2).setDataValidation(ynRule);
    } else if (type === 'Dropdown' && BS_SETTING_DROPDOWNS[name]) {
      var dRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(BS_SETTING_DROPDOWNS[name], true).setAllowInvalid(false).build();
      sh.getRange(bRow, 2).setDataValidation(dRule);
    }
  }

  sh.setFrozenRows(1);
  // The configurable lists are appended below this section by buildSettingsLists_().
  Logger.log('Settings key-value section: ' + rows.length + ' settings written.');
}

/* ================================================================== *
 * PHASE 1.3 — SETTINGS CONFIGURABLE LISTS + NAMED RANGES §2.12        *
 * ------------------------------------------------------------------ *
 * Lists live BELOW the key-value section. Each list block:           *
 *   col A (block start row) = "LIST: {Name}" header                  *
 *   col B (block rows)      = vertical values (+ trailing blanks)     *
 * Named range list_{Name} spans the whole value block so newly typed  *
 * items in the blank tail are picked up automatically (no redeploy).  *
 * ================================================================== */

var BS_LIST_BLOCK = 40;   // rows reserved per list (room to add items)
var BS_LIST_GAP   = 2;    // blank rows between list blocks

/** Ordered list definitions (name → default values). §2.12 */
function bsListDefs_() {
  return [
    ['ExpenseCategories', ['Marketing', 'Logistics', 'Food & Beverage', 'Prizes', 'Tech & Equipment', 'Printing', 'Travel', 'Venue', 'Decorations', 'Miscellaneous']],
    ['ProjectNames', ['StormHacks 2026', 'Club Social — Fall', 'Workshop Series', 'General Operations']],
    ['FundingSources', ['SFSS Club Grant', 'SFSS Resource Funding', 'Club Bank Account', 'Trust Fund', 'External Sponsorship', 'Other']],
    ['PaymentMethods', ['Cheque (via CR)', 'E-Transfer (from club account)', 'E-Transfer (via Finance Director)']],
    ['GrantTypes', ['SFSS Club Grant', 'SFSS Resource Funding', 'External Grant', 'Sponsorship', 'Other']],
    ['CRStatuses', ['Draft', 'Ready to Submit', 'Submitted', 'Follow Up', 'Action Required', 'Approved by SFSS', 'Cheque Received', 'Distributed', 'Cancelled']],
    ['ReimbursementStatuses', ['Approved', 'CR Draft', 'CR Ready to Submit', 'CR Submitted', 'Awaiting Payment', 'Follow Up Required', 'Action Required', 'Payment Received', 'Reimbursed', 'Rejected / Cancelled']],
    ['ApprovalStatuses', ['Pending', 'Coordinator Approved', 'Director Approved', 'Fully Approved', 'Rejected']],
    ['GrantStatuses', ['Applied', 'Under Review', 'Approved', 'Partially Approved', 'Appealed', 'Appeal Approved', 'Denied']],
    ['BudgetStatuses', ['Planning', 'Active', 'Closed', 'Over Budget']],
    ['SelfServiceVisibleFields', ['Name', 'Date', 'Vendor', 'Amount', 'Status']],
    ['TermDateRanges', ['May 1 – Aug 31', 'Sep 1 – Dec 31', 'Jan 1 – Apr 30']],
    ['CoordinatorNames', ['Finance Coordinator']],
    ['DirectorNames', ['Finance Director']],
    ['AuthorizedCRSubmitters', ['Finance Director']],
    ['AuthorizedChequePickups', ['Finance Director']],
    ['PreApprovedOptions', ['Yes – pre-approved', 'No – but urgent or necessary', 'No – forgot to ask']]
  ];
}

/** Replace (or create) a named range, removing any prior definition of the same name. */
function setNamedRange_(ss, name, range) {
  var existing = ss.getNamedRanges();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getName() === name) { existing[i].remove(); }
  }
  ss.setNamedRange(name, range);
}

function buildSettingsLists_(ss) {
  var sh = ss.getSheetByName(BS_SHEETS.SETTINGS);
  if (!sh) { throw new Error('buildSettingsLists_ requires the Settings sheet (run buildSettingsSheet_ first).'); }

  var kvLen = bsSettingsRows_().length;
  var sectionRow = 1 + kvLen + 2;                 // section title row (gap below key-value)
  sh.getRange(sectionRow, 1)
    .setValue('CONFIGURABLE LISTS — edit freely; add items in the blank cells below each list (§2.12)')
    .setFontWeight('bold').setFontColor(BS_COLOR.HEADER_TEXT).setBackground(BS_COLOR.GRAY);
  sh.getRange(sectionRow, 1, 1, 5).setBackground(BS_COLOR.GRAY);

  var defs = bsListDefs_();
  var start = sectionRow + 2;                      // first list block start row

  for (var i = 0; i < defs.length; i++) {
    var name = defs[i][0];
    var values = defs[i][1];

    // Column A header for the block.
    sh.getRange(start, 1).setValue('LIST: ' + name).setFontWeight('bold').setFontColor('#1565c0');

    // Column B values (defaults) + the block tail stays blank for future additions.
    if (values.length) {
      var col = [];
      for (var v = 0; v < values.length; v++) { col.push([values[v]]); }
      sh.getRange(start, 2, values.length, 1).setValues(col);
    }

    // Named range spans the full reserved block (blanks included → auto-pickup of new items).
    var blockRange = sh.getRange(start, 2, BS_LIST_BLOCK, 1);
    setNamedRange_(ss, 'list_' + name, blockRange);

    start += BS_LIST_BLOCK + BS_LIST_GAP;
  }

  sh.setColumnWidth(2, 240);
  Logger.log('Settings lists: ' + defs.length + ' lists + named ranges created.');
}

/* ================================================================== *
 * PHASE 1.4 — APPROVAL QUEUE SHEET (24 cols) §2.4                     *
 * ------------------------------------------------------------------ *
 * Design notes:                                                      *
 *  - Selection dropdowns (O,P,R,S) are sourced from named ranges with *
 *    allowInvalid=true so they (a) stay live as Settings lists change *
 *    and (b) never red-flag bulk-pasted legacy values (migration      *
 *    constraint + S6). Hard rules live in Apps Script onEdit.         *
 *  - Formula/computed cols (M Duplicate Flag, N Receipt Age, Q        *
 *    Approval Status) are NOT pre-filled: pre-filling formulas down    *
 *    thousands of rows would corrupt appendRow()/getLastRow(). Phase 2 *
 *    handlers write these per-row on creation (§2.14).                 *
 * ================================================================== */

/** Apply a dropdown validation sourced from a named range (live, configurable). */
function applyNamedListValidation_(ss, sh, col, listName, allowInvalid, maxRows) {
  var rng = ss.getRangeByName('list_' + listName);
  if (!rng) { throw new Error('applyNamedListValidation_: missing named range list_' + listName); }
  applyRangeValidation_(sh, col, rng, allowInvalid, maxRows);
}

function buildApprovalQueueSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.APPROVAL_QUEUE);
  var headers = [
    'Row ID', 'Timestamp', 'Full Name', 'Email (e-Transfer)', 'Event/Project (Submitted)',
    'Purchase Date', 'Amount (CAD)', 'Vendor', 'Description', 'Pre-Approved?',
    'Receipt File', 'Additional Notes', 'Duplicate Flag', 'Receipt Age (Days)',
    'Coordinator Approval', 'Director Approval', 'Approval Status', 'Standardized Project',
    'Assigned Category', 'Verified Amount (CAD)', 'Rejection Reason', 'Internal Notes',
    'Source Row', 'Last Modified'
  ];
  setHeaders_(sh, headers);

  // Color-coded header groups (§2.4).
  setHeaderColors_(sh, 1, 12, BS_COLOR.BLUE);    // A–L form data
  setHeaderColors_(sh, 13, 14, BS_COLOR.PURPLE); // M–N auto-detected
  setHeaderColors_(sh, 15, 23, BS_COLOR.GREEN);  // O–W finance team
  setHeaderColors_(sh, 24, 24, BS_COLOR.GRAY);   // X system

  // Number / date formats.
  setColumnFormat_(sh, 2, 'MMM d, yyyy h:mm AM/PM');  // B Timestamp
  setColumnFormat_(sh, 6, 'MMM d, yyyy');             // F Purchase Date
  setColumnFormat_(sh, 7, '$#,##0.00');               // G Amount
  setColumnFormat_(sh, 20, '$#,##0.00');              // T Verified Amount
  setColumnFormat_(sh, 24, 'MMM d, yyyy h:mm AM/PM'); // X Last Modified

  // Selection dropdowns (configurable, live, paste-tolerant).
  applyNamedListValidation_(ss, sh, 15, 'CoordinatorNames', true);   // O (special: Rejected)
  applyNamedListValidation_(ss, sh, 16, 'DirectorNames', true);      // P (special: Rejected)
  applyNamedListValidation_(ss, sh, 18, 'ProjectNames', true);       // R Standardized Project
  applyNamedListValidation_(ss, sh, 19, 'ExpenseCategories', true);  // S Assigned Category

  // M / N / Q are script-populated per row (see note above) — no validation here.
  freezeAndHide_(sh, 1, [23, 24]);   // hide Source Row (W) + Last Modified (X)
  sh.setColumnWidth(9, 280);         // Description
  Logger.log('Approval Queue: 24 columns built.');
}

/* ================================================================== *
 * PHASE 1.5 — MILEAGE APPROVALS SHEET (16 cols) §2.5                  *
 * ================================================================== */
function buildMileageApprovalsSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.MILEAGE_APPROVALS);
  var headers = [
    'Row ID', 'Timestamp', 'Full Name', 'Email (e-Transfer)', 'Event/Project',
    'Date of Travel', 'Distance (km)', 'Rate Applied ($/km)', 'Total Payout (CAD)',
    'File Link', 'Notes', 'Status', 'Reviewer', 'Review Date', 'Review Notes', 'Processed'
  ];
  setHeaders_(sh, headers);

  // Color-coded header groups (§2.5).
  setHeaderColors_(sh, 1, 11, BS_COLOR.BLUE);    // A–K submission data
  setHeaderColors_(sh, 12, 15, BS_COLOR.TEAL);   // L–O review
  setHeaderColors_(sh, 16, 16, BS_COLOR.GRAY);   // P system

  // Number / date formats.
  setColumnFormat_(sh, 2, 'MMM d, yyyy h:mm AM/PM');  // B Timestamp
  setColumnFormat_(sh, 6, 'MMM d, yyyy');             // F Date of Travel
  setColumnFormat_(sh, 7, '#,##0.00');                // G Distance
  setColumnFormat_(sh, 8, '$#,##0.0000');             // H Rate Applied ($/km)
  setColumnFormat_(sh, 9, '$#,##0.00');               // I Total Payout
  setColumnFormat_(sh, 14, 'MMM d, yyyy');            // N Review Date

  // L Status dropdown — only Pending/Approved/Rejected are user-selectable;
  // "Moved to Expenses" is set programmatically (§3.2c). allowInvalid keeps
  // the system value from red-flagging.
  applyListValidation_(sh, 12, ['Pending', 'Approved', 'Rejected'], true);

  freezeAndHide_(sh, 1, [16]);   // hide Processed (P)
  // Default Processed=false is written per row on creation (§2.5).
  Logger.log('Mileage Approvals: 16 columns built.');
}

/* ================================================================== *
 * PHASE 1.6 — EXPENSES SHEET (23 cols) §2.6                           *
 * ------------------------------------------------------------------ *
 * §2.6 defines no header color groups, so we mirror the AQ scheme:    *
 * A–L source/copied (blue), M–U finance-managed (green), V–W V2       *
 * system (gray). Computed cols S/T/W and Expense Type (V) are written  *
 * per-row by the move handlers (§2.14) — not pre-filled (appendRow).   *
 * ================================================================== */
/** The 23 Expenses headers (§2.6). Shared so Archive mirrors them exactly (§5.17). */
function bsExpensesHeaders_() {
  return [
    'Row ID', 'Timestamp', 'Full Name', 'Email (e-Transfer)', 'Standardized Project',
    'Purchase Date', 'Verified Amount (CAD)', 'Vendor', 'Description', 'Category',
    'Pre-Approved?', 'Receipt File', 'Funding Source', 'Cheque Requisition #',
    'Reimbursement Status', 'Payment Date', 'Payment Method', 'Payee',
    'Status Age (Days)', 'Follow-Up Flag', 'Internal Notes', 'Expense Type', 'Fiscal Year',
    'Advanced By'   // X (E-1): who fronted the money personally before SFSS repaid the club
  ];
}

/** Apply the shared Expenses schema (headers, colors, formats, validations) to a sheet. */
function applyExpensesSchema_(ss, sh) {
  setHeaders_(sh, bsExpensesHeaders_());

  setHeaderColors_(sh, 1, 12, BS_COLOR.BLUE);    // A–L source/copied
  setHeaderColors_(sh, 13, 21, BS_COLOR.GREEN);  // M–U finance-managed
  setHeaderColors_(sh, 22, 24, BS_COLOR.GRAY);   // V–X system (V2 new + Advanced By)

  setColumnFormat_(sh, 2, 'MMM d, yyyy h:mm AM/PM');  // B Timestamp
  setColumnFormat_(sh, 6, 'MMM d, yyyy');             // F Purchase Date
  setColumnFormat_(sh, 7, '$#,##0.00');               // G Verified Amount
  setColumnFormat_(sh, 16, 'MMM d, yyyy');            // P Payment Date
  setColumnFormat_(sh, 19, '0');                      // S Status Age (int)

  // Selection dropdowns (live, paste-tolerant — supports bulk legacy import §3.3h).
  applyNamedListValidation_(ss, sh, 5, 'ProjectNames', true);            // E
  applyNamedListValidation_(ss, sh, 10, 'ExpenseCategories', true);      // J
  applyNamedListValidation_(ss, sh, 13, 'FundingSources', true);         // M
  applyNamedListValidation_(ss, sh, 15, 'ReimbursementStatuses', true);  // O
  applyNamedListValidation_(ss, sh, 17, 'PaymentMethods', true);         // Q
  applyListValidation_(sh, 22, ['Receipt', 'Mileage'], true);            // V Expense Type

  sh.setColumnWidth(9, 280);   // Description
}

function buildExpensesSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.EXPENSES);
  applyExpensesSchema_(ss, sh);
  freezeAndHide_(sh, 1, null);
  Logger.log('Expenses: 24 columns built.');
}

/* ================================================================== *
 * PHASE 1.7 — CR TRACKER SHEET (fixed A–P + dynamic FS cols) §2.7     *
 * ------------------------------------------------------------------ *
 * Dynamic "FS: {source}" columns are generated from the FundingSources *
 * list, followed by a final "Funding Total Check" column. Per-row      *
 * computed cols (D Total, L #Expenses, M/N flags, Funding Total Check)  *
 * are written by the CR handlers on creation, not pre-filled.          *
 * ================================================================== */

/** Look up a list's default values from bsListDefs_() by name. */
function bsListValues_(name) {
  var defs = bsListDefs_();
  for (var i = 0; i < defs.length; i++) {
    if (defs[i][0] === name) { return defs[i][1]; }
  }
  return [];
}

function buildCRTrackerSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.CR_TRACKER);
  var fixed = [
    'CR Number', 'Date Created', 'Cheque Payable To', 'Total Amount', 'Description',
    'Delivery Method', 'Picked Up By', 'Status', 'Submitted By', 'Date Submitted',
    'Date Cheque Received', '# Expenses', 'Status Age (Days)', 'Follow-Up Flag',
    'Notes', 'Last Modified'
  ];
  var fundingSources = bsListValues_('FundingSources');
  var fsHeaders = [];
  for (var i = 0; i < fundingSources.length; i++) { fsHeaders.push('FS: ' + fundingSources[i]); }

  var headers = fixed.concat(fsHeaders).concat(['Funding Total Check']);
  setHeaders_(sh, headers);

  var fsStart = fixed.length + 1;                 // first FS column (1-based) = 17
  var fsEnd = fsStart + fsHeaders.length - 1;     // last FS column = 22
  var checkCol = headers.length;                  // Funding Total Check = 23

  // Header colors.
  setHeaderColors_(sh, 1, 15, BS_COLOR.GREEN);          // A–O finance
  setHeaderColors_(sh, 16, 16, BS_COLOR.GRAY);          // P Last Modified
  setHeaderColors_(sh, fsStart, fsEnd, BS_COLOR.TEAL);  // FS columns
  setHeaderColors_(sh, checkCol, checkCol, BS_COLOR.GRAY);

  // Formats.
  setColumnFormat_(sh, 2, 'MMM d, yyyy');             // B Date Created
  setColumnFormat_(sh, 4, '$#,##0.00');               // D Total Amount
  setColumnFormat_(sh, 10, 'MMM d, yyyy');            // J Date Submitted
  setColumnFormat_(sh, 11, 'MMM d, yyyy');            // K Date Cheque Received
  setColumnFormat_(sh, 12, '0');                      // L # Expenses
  setColumnFormat_(sh, 16, 'MMM d, yyyy h:mm AM/PM'); // P Last Modified
  for (var c = fsStart; c <= fsEnd; c++) { setColumnFormat_(sh, c, '$#,##0.00'); }

  // Validations (live, paste-tolerant).
  applyListValidation_(sh, 6, ['Pick up on campus', 'Mail on campus', 'Mail off campus'], true);  // F
  applyNamedListValidation_(ss, sh, 7, 'AuthorizedChequePickups', true);   // G
  applyNamedListValidation_(ss, sh, 8, 'CRStatuses', true);                // H Status
  applyNamedListValidation_(ss, sh, 9, 'AuthorizedCRSubmitters', true);    // I

  freezeAndHide_(sh, 1, [16]);   // hide Last Modified
  Logger.log('CR Tracker: ' + headers.length + ' columns (' + fsHeaders.length + ' FS cols) built.');
}

/* ================================================================== *
 * PHASE 1.8 — GRANTS SHEET (20 cols) §2.8                             *
 * ================================================================== */
function buildGrantsSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.GRANTS);
  var headers = [
    'Grant ID', 'Grant Name / Source', 'Grant Type', 'Application Date', 'Amount Requested',
    'Status', 'Amount Approved', 'Amount Spent', 'Amount Remaining', 'Utilization %',
    'Utilization Bar', 'Appeal Details', 'Appeal Date', 'Appeal Amount',
    'Appeal Amount Approved', 'Follow-Up Date', 'Follow-Up Flag', 'Pre-Approved?',
    'Fiscal Year', 'Notes'
  ];
  setHeaders_(sh, headers);

  setHeaderColors_(sh, 1, 7, BS_COLOR.BLUE);    // A–G manual entry
  setHeaderColors_(sh, 8, 11, BS_COLOR.GRAY);   // H–K computed
  setHeaderColors_(sh, 12, 15, BS_COLOR.TEAL);  // L–O appeal
  setHeaderColors_(sh, 16, 17, BS_COLOR.GRAY);  // P–Q computed
  setHeaderColors_(sh, 18, 20, BS_COLOR.GREEN);  // R–T manual

  // Formats.
  setColumnFormat_(sh, 4, 'MMM d, yyyy');   // D Application Date
  setColumnFormat_(sh, 5, '$#,##0.00');     // E Amount Requested
  setColumnFormat_(sh, 7, '$#,##0.00');     // G Amount Approved
  setColumnFormat_(sh, 8, '$#,##0.00');     // H Amount Spent
  setColumnFormat_(sh, 9, '$#,##0.00');     // I Amount Remaining
  setColumnFormat_(sh, 13, 'MMM d, yyyy');  // M Appeal Date
  setColumnFormat_(sh, 14, '$#,##0.00');    // N Appeal Amount
  setColumnFormat_(sh, 15, '$#,##0.00');    // O Appeal Amount Approved
  setColumnFormat_(sh, 16, 'MMM d, yyyy');  // P Follow-Up Date

  // Validations.
  applyNamedListValidation_(ss, sh, 3, 'GrantTypes', true);     // C
  applyNamedListValidation_(ss, sh, 6, 'GrantStatuses', true);  // F
  applyListValidation_(sh, 18, ['Y', 'N'], true);               // R Pre-Approved?

  sh.getRange(2, 11, 2000, 1).setFontFamily('Roboto Mono');  // K Utilization Bar — monospace
  freezeAndHide_(sh, 1, null);
  Logger.log('Grants: 20 columns built.');
}

/* ================================================================== *
 * PHASE 1.9 — BUDGETS SHEET (11 cols) §2.9                           *
 * ================================================================== */
function buildBudgetsSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.BUDGETS);
  var headers = [
    'Event / Project', 'Allocated Budget', 'Amount Spent', 'Amount Committed',
    'Amount Remaining', 'Utilization %', 'Health Bar', 'Funding Source(s)',
    'Status', 'Fiscal Year', 'Notes'
  ];
  setHeaders_(sh, headers);

  setHeaderColors_(sh, 1, 2, BS_COLOR.BLUE);    // A–B manual entry
  setHeaderColors_(sh, 3, 7, BS_COLOR.GRAY);    // C–G computed
  setHeaderColors_(sh, 8, 11, BS_COLOR.GREEN);  // H–K manual

  setColumnFormat_(sh, 2, '$#,##0.00');  // B Allocated
  setColumnFormat_(sh, 3, '$#,##0.00');  // C Spent
  setColumnFormat_(sh, 4, '$#,##0.00');  // D Committed
  setColumnFormat_(sh, 5, '$#,##0.00');  // E Remaining
  sh.getRange(2, 7, 2000, 1).setFontFamily('Roboto Mono');  // G Health Bar — monospace

  applyNamedListValidation_(ss, sh, 1, 'ProjectNames', true);    // A
  applyNamedListValidation_(ss, sh, 8, 'FundingSources', true);  // H
  applyNamedListValidation_(ss, sh, 9, 'BudgetStatuses', true);  // I

  freezeAndHide_(sh, 1, null);
  Logger.log('Budgets: 11 columns built.');
}

/* ================================================================== *
 * PHASE 1.10 — RECONCILIATION SHEET (two-section layout) §2.10        *
 * ------------------------------------------------------------------ *
 * §1 CR Reconciliation: title row 1, headers row 2, data row 3+.      *
 * §2 Payment Distribution: title row 20, headers row 21, data row 22+. *
 * Section 1's H/I/J/K are Live formulas written per-row by the         *
 * reconciliation generator (rows are script-generated). Bootstrap lays *
 * out titles + headers + range number formats only.                    *
 * ================================================================== */
function buildReconciliationSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.RECONCILIATION);

  // ---- Section 1 title (row 1) + headers (row 2) ----
  var s1Headers = [
    'CR Number', 'Expected Amount', 'Cheque Received?', 'Date Received',
    'Actual Amount Received', 'Supplementary Source', 'Supplementary Amount',
    'Discrepancy', 'Discrepancy Flag', 'Total Available', 'Coverage Flag',
    'Distributed?', 'Notes'
  ];
  sh.getRange(1, 1, 1, s1Headers.length).merge();
  sh.getRange(1, 1).setValue('§1 — CR RECONCILIATION')
    .setFontWeight('bold').setFontColor(BS_COLOR.HEADER_TEXT).setBackground(BS_COLOR.GRAY);
  var h1 = sh.getRange(2, 1, 1, s1Headers.length);
  h1.setValues([s1Headers]).setFontWeight('bold').setFontColor(BS_COLOR.HEADER_TEXT)
    .setBackground(BS_COLOR.TEAL).setWrap(true);

  // §1 column formats (data rows 3–19 per the pinned layout).
  sh.getRange(3, 2, 17, 1).setNumberFormat('$#,##0.00');   // B Expected
  sh.getRange(3, 4, 17, 1).setNumberFormat('MMM d, yyyy'); // D Date Received
  sh.getRange(3, 5, 17, 1).setNumberFormat('$#,##0.00');   // E Actual
  sh.getRange(3, 7, 17, 1).setNumberFormat('$#,##0.00');   // G Supplementary
  sh.getRange(3, 8, 17, 1).setNumberFormat('$#,##0.00');   // H Discrepancy
  sh.getRange(3, 10, 17, 1).setNumberFormat('$#,##0.00');  // J Total Available

  // ---- Section 2 title (row 20) + headers (row 21) ----
  var s2Headers = [
    'Payment Source (CR#)', 'Payee', 'Amount Paid', 'Date Paid',
    'Payment Method', 'Linked Expense IDs', 'Reconciled?', 'Notes'
  ];
  sh.getRange(20, 1, 1, s2Headers.length).merge();
  sh.getRange(20, 1).setValue('§2 — PAYMENT DISTRIBUTION (auto-generated + manual)')
    .setFontWeight('bold').setFontColor(BS_COLOR.HEADER_TEXT).setBackground(BS_COLOR.GRAY);
  var h2 = sh.getRange(21, 1, 1, s2Headers.length);
  h2.setValues([s2Headers]).setFontWeight('bold').setFontColor(BS_COLOR.HEADER_TEXT)
    .setBackground(BS_COLOR.TEAL).setWrap(true);

  // §2 column formats (data rows 22+).
  sh.getRange(22, 3, 200, 1).setNumberFormat('$#,##0.00');   // C Amount Paid
  sh.getRange(22, 4, 200, 1).setNumberFormat('MMM d, yyyy'); // D Date Paid

  sh.setFrozenRows(2);
  Logger.log('Reconciliation: two-section layout built (§1 rows 3+, §2 rows 22+).');
}

/* ================================================================== *
 * PHASE 1.11 — AUDIT LOG SHEET (9 cols) §2.11                         *
 * ------------------------------------------------------------------ *
 * Warning-only protection: only Apps Script should write here.        *
 * Timestamp (col A) is a pre-formatted string (MMM D, YYYY, h:mm AM/PM)*
 * written by logToAudit() — kept as text, not a date cell.            *
 * ================================================================== */
function buildAuditLogSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.AUDIT_LOG);
  var headers = [
    'Timestamp', 'User', 'Action', 'Sheet', 'Record ID', 'Field',
    'Old Value', 'New Value', 'Details'
  ];
  setHeaders_(sh, headers);
  setHeaderColors_(sh, 1, headers.length, BS_COLOR.GRAY);

  sh.getRange(2, 1, 2000, 1).setNumberFormat('@');  // A Timestamp as plain text
  sh.setColumnWidth(1, 190);
  sh.setColumnWidth(3, 170);   // Action
  sh.setColumnWidth(8, 320);   // New Value
  freezeAndHide_(sh, 1, null);

  // Warning-only protection (script writes; humans get a soft warning).
  var existing = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (var i = 0; i < existing.length; i++) { existing[i].remove(); }
  sh.protect().setWarningOnly(true).setDescription('Audit Log — script-written; do not edit manually.');

  Logger.log('Audit Log: 9 columns built (warning-only protection).');
}

/* ================================================================== *
 * PHASE 1.12 — DASHBOARD DATA (cache) + ARCHIVE SHEETS §6.1 / §5.17   *
 * ------------------------------------------------------------------ *
 * Dashboard Data is a write-through JSON cache: col A = key,          *
 * col B = JSON value, col C = updated timestamp. refreshDashboardData()*
 * (Phase 3) populates it; the Web App reads A:C in one shot (§6.1).    *
 * Archive mirrors the Expenses schema EXACTLY for prior-FY terminal    *
 * rows (§5.17). Reports union Expenses ∪ Archive for archived periods. *
 * ================================================================== */

/** Cache keys seeded into Dashboard Data so the structure is self-documenting. */
function bsDashboardKeys_() {
  return [
    'lastRefresh', 'version', 'fiscalYear', 'kpis', 'chartByCategory', 'chartByProject',
    'chartByFundingSource', 'chartMonthly', 'chartTopSubmitters', 'pipeline', 'alerts',
    'activity', 'lists', 'reconciliationSummary', 'yearEndChecklist', 'readyToMoveCount',
    'advances', 'health'
  ];
}

function buildDashboardDataSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.DASHBOARD_DATA);
  setHeaders_(sh, ['Key', 'Value (JSON)', 'Updated']);
  setHeaderColors_(sh, 1, 3, BS_COLOR.GRAY);

  var keys = bsDashboardKeys_();
  var rows = [];
  for (var i = 0; i < keys.length; i++) { rows.push([keys[i], '', '']); }
  sh.getRange(2, 1, rows.length, 3).setValues(rows);

  sh.getRange(2, 1, rows.length, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 640);
  sh.setColumnWidth(3, 200);
  sh.getRange(2, 3, rows.length, 1).setNumberFormat('MMM d, yyyy h:mm AM/PM');
  freezeAndHide_(sh, 1, null);
  Logger.log('Dashboard Data: cache layout with ' + keys.length + ' keys built.');
}

function buildArchiveSheet_(ss) {
  var sh = getOrCreateSheet_(ss, BS_SHEETS.ARCHIVE);
  applyExpensesSchema_(ss, sh);   // exact mirror of Expenses (§5.17)
  // A note in the header tooltip-equivalent: keep a marker row? No — Archive must
  // remain row-for-row compatible with Expenses for the union read. Headers only.
  freezeAndHide_(sh, 1, null);
  Logger.log('Archive: Expenses-mirror schema built (prior-FY terminal records).');
}

/* ================================================================== *
 * PHASE 1.12 — FORM RESPONSES STUBS §2.2 / §2.3                       *
 * ------------------------------------------------------------------ *
 * Real Form Responses sheets are auto-created by Google Forms. We     *
 * create header-only stand-ins so the schema is complete pre-linking. *
 * Do NOT delete the real sheets once the Forms are attached.          *
 * ================================================================== */
function buildFormResponseStubs_(ss) {
  var r1 = getOrCreateSheet_(ss, BS_SHEETS.FORM_RESPONSES);
  setHeaders_(r1, [
    'Timestamp', 'Full Name', 'Email Address for Interac e-Transfer Reimbursement',
    'Event / Project Name', 'Date of Purchase (as shown on receipt)',
    'Amount Paid (CAD) (no $ symbol)', 'Vendor / Store Name',
    'Describe the Expense (what and why?)',
    'Was this pre-approved or part of a planned purchase?',
    'Upload Receipt (PDF or Image)', 'Additional Notes (Optional)'
  ]);
  setHeaderColors_(r1, 1, 11, BS_COLOR.BLUE);
  r1.setFrozenRows(1);

  var r2 = getOrCreateSheet_(ss, BS_SHEETS.MILEAGE_RESPONSES);
  setHeaders_(r2, [
    'Timestamp', 'Full Name', 'Email Address for Interac e-Transfer Reimbursement',
    'Event / Project Name', 'Date of Travel', 'Distance Traveled (km)',
    'Reimbursement Rate', 'Custom Rate ($/km)', 'Upload Supporting Document (Optional)',
    'Additional Notes (Optional)'
  ]);
  setHeaderColors_(r2, 1, 10, BS_COLOR.BLUE);
  r2.setFrozenRows(1);
  Logger.log('Form Responses 1 & 2: header-only stubs built.');
}

/* ================================================================== *
 * PHASE 1.13 — CONDITIONAL FORMATTING §4.2 (+ D1/D2)                  *
 * ------------------------------------------------------------------ *
 * Row-level status colors via formula rules anchored on the status    *
 * column. Implements the explicit V2 additions (Action Required,      *
 * Cancelled, Fully Approved + col-A accent lane D2, duplicate purple)  *
 * plus sensible terminal-status colors from the defined palette.      *
 * NOTE: CF cannot set borders, so the D2 "4px left accent" is          *
 * approximated by a solid accent fill on column A of Fully Approved    *
 * rows. The script-driven gray-out on move still applies on top.       *
 * ================================================================== */

/** Build a formula-based conditional-format rule for an A1 range. */
function bsFormulaRule_(sh, a1Range, formula, bg, fontColor) {
  var b = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground(bg)
    .setRanges([sh.getRange(a1Range)]);
  if (fontColor) { b.setFontColor(fontColor); }
  return b.build();
}

function applyAllConditionalFormatting_(ss) {
  // ---- Approval Queue (Approval Status = col Q) ----
  var aq = ss.getSheetByName(BS_SHEETS.APPROVAL_QUEUE);
  aq.setConditionalFormatRules([
    // col-A accent lane FIRST so it wins precedence on column A (D2).
    bsFormulaRule_(aq, 'A2:A1000', '=$Q2="Fully Approved"', BS_FMT.ACCENT_GRN, BS_COLOR.HEADER_TEXT),
    bsFormulaRule_(aq, 'A2:X1000', '=$Q2="Rejected"', BS_FMT.GRAY_BG),
    bsFormulaRule_(aq, 'A2:X1000', '=$Q2="Moved to Expenses"', BS_FMT.GRAY_BG),
    bsFormulaRule_(aq, 'A2:X1000', '=$Q2="Fully Approved"', BS_FMT.GREEN_BG),
    bsFormulaRule_(aq, 'A2:X1000', '=ISNUMBER(SEARCH("DUPLICATE",$M2))', BS_FMT.PURPLE_BG)
  ]);

  // ---- Expenses (Reimbursement Status = col O) ----
  var ex = ss.getSheetByName(BS_SHEETS.EXPENSES);
  ex.setConditionalFormatRules([
    bsFormulaRule_(ex, 'A2:W1000', '=$O2="Action Required"', BS_FMT.AMBER_BG),       // D1
    bsFormulaRule_(ex, 'A2:W1000', '=$O2="Rejected / Cancelled"', BS_FMT.GRAY_BG),
    bsFormulaRule_(ex, 'A2:W1000', '=$O2="Reimbursed"', BS_FMT.GREEN_BG)
  ]);

  // ---- CR Tracker (Status = col H) ----
  var cr = ss.getSheetByName(BS_SHEETS.CR_TRACKER);
  cr.setConditionalFormatRules([
    bsFormulaRule_(cr, 'A2:W1000', '=$H2="Action Required"', BS_FMT.AMBER_BG),       // D1
    bsFormulaRule_(cr, 'A2:W1000', '=$H2="Cancelled"', BS_FMT.GRAY_BG),              // D1
    bsFormulaRule_(cr, 'A2:W1000', '=$H2="Follow Up"', BS_FMT.AMBER_BG),
    bsFormulaRule_(cr, 'A2:W1000', '=$H2="Distributed"', BS_FMT.GREEN_BG)
  ]);

  // ---- Budgets (Status = col I) ----
  var bu = ss.getSheetByName(BS_SHEETS.BUDGETS);
  bu.setConditionalFormatRules([
    bsFormulaRule_(bu, 'A2:K1000', '=$I2="Over Budget"', BS_FMT.RED_BG),
    bsFormulaRule_(bu, 'A2:K1000', '=$I2="Closed"', BS_FMT.GRAY_BG)
  ]);

  // ---- Grants (Status = col F) ----
  var gr = ss.getSheetByName(BS_SHEETS.GRANTS);
  gr.setConditionalFormatRules([
    bsFormulaRule_(gr, 'A2:T1000', '=$F2="Denied"', BS_FMT.GRAY_BG),
    bsFormulaRule_(gr, 'A2:T1000', '=OR($F2="Approved",$F2="Appeal Approved")', BS_FMT.GREEN_BG)
  ]);

  // ---- Mileage Approvals (Status = col L) ----
  var mi = ss.getSheetByName(BS_SHEETS.MILEAGE_APPROVALS);
  mi.setConditionalFormatRules([
    bsFormulaRule_(mi, 'A2:O1000', '=$L2="Rejected"', BS_FMT.GRAY_BG),
    bsFormulaRule_(mi, 'A2:O1000', '=OR($L2="Approved",$L2="Moved to Expenses")', BS_FMT.GREEN_BG)
  ]);

  Logger.log('Conditional formatting applied to 6 sheets.');
}

/**
 * Post-build self-check: every registry sheet exists AND every list_ named
 * range was created. Throws on the first problem so a broken build is loud.
 */
function verifySchema_(ss) {
  var missing = [];
  for (var i = 0; i < BS_SHEET_ORDER.length; i++) {
    if (!ss.getSheetByName(BS_SHEET_ORDER[i])) { missing.push('sheet:' + BS_SHEET_ORDER[i]); }
  }
  var defs = bsListDefs_();
  for (var j = 0; j < defs.length; j++) {
    if (!ss.getRangeByName('list_' + defs[j][0])) { missing.push('range:list_' + defs[j][0]); }
  }
  if (missing.length) {
    throw new Error('verifySchema_ failed — missing: ' + missing.join(', '));
  }
  Logger.log('verifySchema_ OK — ' + BS_SHEET_ORDER.length + ' sheets + ' + defs.length + ' named ranges present.');
}
