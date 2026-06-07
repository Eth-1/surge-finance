/**
 * ============================================================================
 * Config.gs — constants, sheet/column maps, settings reader, cfg object
 * ============================================================================
 * Single source of truth for: sheet names, 1-based column indices per sheet,
 * settings access (getSettingValue / getSettingNumber / getSettingBool),
 * configurable-list access (getListValues), and the typed cfg object the rest
 * of the engine reads.
 *
 * Settings are memoized PER EXECUTION (not across executions) so every trigger
 * run sees the current Settings sheet — this is what makes lists/settings
 * "trivially editable, no redeploy" (§2.12) work safely.
 * ES5-compatible.
 * ============================================================================
 */

/* Sheet names (must match bootstrap.gs BS_SHEETS). */
var SHEETS = {
  SETTINGS:          'Settings',
  APPROVAL_QUEUE:    'Approval Queue',
  MILEAGE_APPROVALS: 'Mileage Approvals',
  EXPENSES:          'Expenses',
  CR_TRACKER:        'CR Tracker',
  GRANTS:            'Grants',
  BUDGETS:           'Budgets',
  RECONCILIATION:    'Reconciliation',
  AUDIT_LOG:         'Audit Log',
  DASHBOARD_DATA:    'Dashboard Data',
  FORM_RESPONSES:    'Form Responses 1',
  MILEAGE_RESPONSES: 'Form Responses 2',
  ARCHIVE:           'Archive'
};

/* 1-based column indices per sheet (§2). */
var COLS = {
  AQ: {
    ROW_ID: 1, TIMESTAMP: 2, FULL_NAME: 3, EMAIL: 4, EVENT_SUBMITTED: 5, PURCHASE_DATE: 6,
    AMOUNT: 7, VENDOR: 8, DESCRIPTION: 9, PRE_APPROVED: 10, RECEIPT_FILE: 11, NOTES: 12,
    DUPLICATE_FLAG: 13, RECEIPT_AGE: 14, COORD_APPROVAL: 15, DIR_APPROVAL: 16,
    APPROVAL_STATUS: 17, STD_PROJECT: 18, CATEGORY: 19, VERIFIED_AMOUNT: 20,
    REJECTION_REASON: 21, INTERNAL_NOTES: 22, SOURCE_ROW: 23, LAST_MODIFIED: 24, WIDTH: 24
  },
  MILEAGE: {
    ROW_ID: 1, TIMESTAMP: 2, FULL_NAME: 3, EMAIL: 4, EVENT: 5, DATE_TRAVEL: 6, DISTANCE: 7,
    RATE: 8, PAYOUT: 9, FILE_LINK: 10, NOTES: 11, STATUS: 12, REVIEWER: 13, REVIEW_DATE: 14,
    REVIEW_NOTES: 15, PROCESSED: 16, WIDTH: 16
  },
  EXP: {
    ROW_ID: 1, TIMESTAMP: 2, FULL_NAME: 3, EMAIL: 4, STD_PROJECT: 5, PURCHASE_DATE: 6,
    VERIFIED_AMOUNT: 7, VENDOR: 8, DESCRIPTION: 9, CATEGORY: 10, PRE_APPROVED: 11,
    RECEIPT_FILE: 12, FUNDING_SOURCE: 13, CR_NUMBER: 14, REIMB_STATUS: 15, PAYMENT_DATE: 16,
    PAYMENT_METHOD: 17, PAYEE: 18, STATUS_AGE: 19, FOLLOWUP_FLAG: 20, INTERNAL_NOTES: 21,
    EXPENSE_TYPE: 22, FISCAL_YEAR: 23, ADVANCED_BY: 24, WIDTH: 24
  },
  CR: {
    CR_NUMBER: 1, DATE_CREATED: 2, PAYABLE_TO: 3, TOTAL_AMOUNT: 4, DESCRIPTION: 5,
    DELIVERY_METHOD: 6, PICKED_UP_BY: 7, STATUS: 8, SUBMITTED_BY: 9, DATE_SUBMITTED: 10,
    DATE_CHEQUE_RECEIVED: 11, NUM_EXPENSES: 12, STATUS_AGE: 13, FOLLOWUP_FLAG: 14,
    NOTES: 15, LAST_MODIFIED: 16, FS_START: 17, FIXED_WIDTH: 16
  },
  GRANT: {
    GRANT_ID: 1, GRANT_NAME: 2, GRANT_TYPE: 3, APP_DATE: 4, AMT_REQUESTED: 5, STATUS: 6,
    AMT_APPROVED: 7, AMT_SPENT: 8, AMT_REMAINING: 9, UTILIZATION: 10, UTIL_BAR: 11,
    APPEAL_DETAILS: 12, APPEAL_DATE: 13, APPEAL_AMOUNT: 14, APPEAL_AMT_APPROVED: 15,
    FOLLOWUP_DATE: 16, FOLLOWUP_FLAG: 17, PRE_APPROVED: 18, FISCAL_YEAR: 19, NOTES: 20, WIDTH: 20
  },
  BUDGET: {
    PROJECT: 1, ALLOCATED: 2, SPENT: 3, COMMITTED: 4, REMAINING: 5, UTILIZATION: 6,
    HEALTH_BAR: 7, FUNDING_SOURCES: 8, STATUS: 9, FISCAL_YEAR: 10, NOTES: 11, WIDTH: 11
  },
  RECON: {
    // Section 1 (CR reconciliation)
    S1_TITLE_ROW: 1, S1_HEADER_ROW: 2, S1_DATA_ROW: 3, S1_WIDTH: 13,
    S1_CR_NUMBER: 1, S1_EXPECTED: 2, S1_RECEIVED_FLAG: 3, S1_DATE_RECEIVED: 4, S1_ACTUAL: 5,
    S1_SUPP_SOURCE: 6, S1_SUPP_AMOUNT: 7, S1_DISCREPANCY: 8, S1_DISCREPANCY_FLAG: 9,
    S1_TOTAL_AVAIL: 10, S1_COVERAGE_FLAG: 11, S1_DISTRIBUTED: 12, S1_NOTES: 13,
    // Section 2 (payment distribution)
    S2_TITLE_ROW: 20, S2_HEADER_ROW: 21, S2_DATA_ROW: 22, S2_WIDTH: 8,
    S2_SOURCE: 1, S2_PAYEE: 2, S2_AMOUNT: 3, S2_DATE_PAID: 4, S2_METHOD: 5,
    S2_LINKED_IDS: 6, S2_RECONCILED: 7, S2_NOTES: 8
  },
  AUDIT: { TIMESTAMP: 1, USER: 2, ACTION: 3, SHEET: 4, RECORD_ID: 5, FIELD: 6, OLD: 7, NEW: 8, DETAILS: 9, WIDTH: 9 },
  SETTINGS: { SETTING: 1, VALUE: 2, DESC: 3, DEFAULT: 4, TYPE: 5 }
};

/* ------------------------------------------------------------------ *
 * Spreadsheet / sheet accessors                                       *
 * ------------------------------------------------------------------ */
function getSs_() { return SpreadsheetApp.getActive(); }

function getSheet_(name) {
  var sh = getSs_().getSheetByName(name);
  if (!sh) { throw new Error('Missing sheet: ' + name + ' (run buildAll() to bootstrap).'); }
  return sh;
}

/**
 * Find the first data row (≥2) in `sheetName` whose `col` equals `value`.
 * Returns the 1-based row index, or 0 if not found. Used for Row-ID / CR#
 * lookups (matched by value, never by stale index — F8).
 */
function findRowByValue_(sheetName, col, value) {
  var sh = getSheet_(sheetName);
  var last = sh.getLastRow();
  if (last < 2) { return 0; }
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  var target = String(value);
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === target) { return i + 2; }
  }
  return 0;
}

/* ------------------------------------------------------------------ *
 * Settings access (per-execution memo)                                *
 * ------------------------------------------------------------------ */
var _SETTINGS_MEMO = null;

/** Load Settings key-value pairs into a { name: {value, def} } map (once/execution). */
function _loadSettings_() {
  if (_SETTINGS_MEMO) { return _SETTINGS_MEMO; }
  var sh = getSheet_(SHEETS.SETTINGS);
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, 4).getValues();  // A:D
    for (var i = 0; i < vals.length; i++) {
      var key = String(vals[i][0]).trim();
      if (key && key.indexOf('LIST:') !== 0 && key.indexOf('CONFIGURABLE LISTS') !== 0) {
        map[key] = { value: vals[i][1], def: vals[i][3] };
      }
    }
  }
  _SETTINGS_MEMO = map;
  return map;
}

/** Clear the per-execution settings memo (call after writing a setting). */
function clearSettingsCache() { _SETTINGS_MEMO = null; }

/** Raw setting value; falls back to the Default column when Value is blank. §2.12 */
function getSettingValue(key) {
  var m = _loadSettings_();
  if (!m.hasOwnProperty(key)) { return ''; }
  var v = m[key].value;
  if (v === '' || v === null || typeof v === 'undefined') { return m[key].def; }
  return v;
}

function getSettingNumber(key, fallback) {
  var v = Number(getSettingValue(key));
  return isNaN(v) ? (typeof fallback === 'number' ? fallback : 0) : v;
}

function getSettingBool(key) {
  return String(getSettingValue(key)).trim().toUpperCase() === 'Y';
}

/** Configurable list values from named range list_{name}, blanks filtered. §2.12 */
function getListValues(name) {
  var rng = getSs_().getRangeByName('list_' + name);
  if (!rng) { return []; }
  var vals = rng.getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0]).trim();
    if (v) { out.push(v); }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Typed cfg object — the camelCase config the engine reads             *
 * ------------------------------------------------------------------ */
function getCfg() {
  return {
    dashboardPassword:        getSettingValue('Dashboard Password'),
    mileageStandardRate:      getSettingNumber('MileageStandardRate', 0.22),       // F9
    approvalMode:             String(getSettingValue('Approval Mode') || 'Sequential'),
    autoApproveEnabled:       getSettingBool('Auto-Approve Enabled'),
    autoApproveThreshold:     getSettingNumber('Auto-Approve Threshold', 0),
    allowOverBudget:          getSettingBool('Allow Over Budget Submissions'),
    enableDuplicateDetection: getSettingBool('Enable Duplicate Detection'),
    duplicateWindowDays:      getSettingNumber('Duplicate Window Days', 7),
    receiptAgeThresholdDays:  getSettingNumber('Receipt Age Threshold Days', 2),
    budgetWarningPercent:     getSettingNumber('Budget Warning Percent', 75),
    budgetCriticalPercent:    getSettingNumber('Budget Critical Percent', 90),
    budgetOverLimitPercent:   getSettingNumber('Budget Over Limit Percent', 100),
    includeCommittedInBudget: getSettingBool('Include Committed in Budget Calc'),
    grantWarningPercent:      getSettingNumber('Grant Warning Percent', 80),
    grantCriticalPercent:     getSettingNumber('Grant Critical Percent', 95),
    grantFollowUpDays:        getSettingNumber('Grant Follow-Up Days', 14),
    grantAppealWindowDays:    getSettingNumber('Grant Appeal Window Days', 30),
    crFollowUpWeeks:          getSettingNumber('CR Follow-Up Weeks', 3),
    crFollowUpEscalationWeeks: getSettingNumber('CR Escalation Weeks', 6),
    paymentFollowUpWeeks:     getSettingNumber('Payment Follow-Up Weeks', 2),
    paymentEscalationWeeks:   getSettingNumber('Payment Escalation Weeks', 4),
    largeExpenseThreshold:    getSettingNumber('Large Expense Threshold', 500),
    auditRetentionMonths:     getSettingNumber('Audit Retention Months', 24),
    enableArchiving:          getSettingBool('Enable Archiving'),
    keepLiveFiscalYears:      getSettingNumber('Keep Live Fiscal Years', 2),
    maxExpensesPerCR:         getSettingNumber('Max Expenses Per CR', 0),
    fiscalYearStart:          String(getSettingValue('Fiscal Year Start') || 'May 1'),
    crNumberingFormat:        String(getSettingValue('CR Numbering Format') || 'CR-{FY}-{###}'),
    crNumberingStart:         getSettingNumber('CR Numbering Start', 1),
    defaultPayee:             getSettingValue('Default Payee'),
    defaultCRPayee:           getSettingValue('Default CR Payee'),
    moveFilesOnStatusChange:  getSettingBool('Move Files On Status Change'),
    auditLogEdits:            getSettingBool('Audit Log Edits'),
    selfServiceEnabled:       getSettingBool('Self-Service Enabled'),
    showDeniedGrants:         getSettingBool('Show Denied Grants'),
    activityFeedCount:        getSettingNumber('Activity Feed Count', 15),
    tokenExpiryDays:          getSettingNumber('Dashboard Token Expiry Days', 7),
    statusCacheSeconds:       getSettingNumber('Status Per-Email Cache Seconds', 60),
    statusRateLimitPerMin:    getSettingNumber('Status Edge Rate Limit Per Min', 5),
    statusCircuitBreakerPerHour: getSettingNumber('Status Circuit Breaker Per Hour', 800),
    authCheckRateLimitPerMin: getSettingNumber('AuthCheck Rate Limit Per Min', 5),
    webhookDebounceSeconds:   getSettingNumber('On-Edit Webhook Debounce Seconds', 30),
    precomputeCadenceMinutes: getSettingNumber('Backend Precompute Cadence Minutes', 5),
    receiptsRootFolderId:     String(getSettingValue('Receipts Root Folder ID') || ''),
    revalidateWebhookUrl:     String(getSettingValue('Revalidate Webhook URL') || ''),
    followUpCheckFrequency:   String(getSettingValue('Follow-Up Check Frequency') || 'Daily')
  };
}
