# SFU Surge Finance Dashboard — V2 System Specification

> **Version**: 2.2 — Finalized Architecture (stress-test hardened)  
> **Date**: 2026-06-05  
> **Purpose**: Unified specification for migrating the GAS frontend to a Vercel-hosted Next.js application with an upgraded Google Sheets backend and refactored Apps Script engine.  
> **Migration Constraint**: The new Google Sheet schema and Apps Script logic must support manual, bulk copy-pasting of legacy expense details into required columns without breaking downstream automations or UI rendering.  
> **Retention Constraint**: 100% of V1 core business logic, status states, approval queues, and feature requirements are retained. This document upgrades the engine and interface only.  
> **Design Priority**: The Vercel-hosted Next.js site must deliver noticeably better responsiveness, reliability, and visual quality than the legacy GAS web app. These are first-class requirements.  
> **Configurability Priority**: The Settings sheet must be trivially editable by non-technical finance team members — adding events, categories, or funding sources must never require code changes or redeployment.

---

# PART 1: ARCHITECTURE & ACCESS MODEL

---

## §1 System Architecture Overview

### 1.1 Component Topology

```
┌─────────────────────────────────────────────────────────┐
│                    GOOGLE WORKSPACE                      │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ Google Form 1 │   │ Google Form 2 │   │ Google Drive  │ │
│  │ (Receipts)    │   │ (Mileage)     │   │ (Receipts)    │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┘ │
│         │                  │                              │
│  ┌──────▼──────────────────▼───────────────────────────┐ │
│  │              GOOGLE SHEETS (Database)                │ │
│  │  ┌─────────┐ ┌────────┐ ┌─────────┐ ┌───────────┐  │ │
│  │  │ Approval│ │Mileage │ │Expenses │ │ CR Tracker│  │ │
│  │  │ Queue   │ │Approvals│ │         │ │           │  │ │
│  │  └─────────┘ └────────┘ └─────────┘ └───────────┘  │ │
│  │  ┌─────────┐ ┌────────┐ ┌──────────┐┌───────────┐  │ │
│  │  │ Grants  │ │Budgets │ │Reconcile ││ Audit Log │  │ │
│  │  └─────────┘ └────────┘ └──────────┘└───────────┘  │ │
│  │  ┌─────────┐ ┌──────────────┐                       │ │
│  │  │Settings │ │Dashboard Data│                       │ │
│  │  └─────────┘ └──────┬───────┘                       │ │
│  └──────────────────────┼──────────────────────────────┘ │
│                         │                                 │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │          APPS SCRIPT (Workflow Engine)               │ │
│  │  • onFormSubmit triggers                             │ │
│  │  • onEdit state machine                              │ │
│  │  • Menu actions (Move to Expenses, Create CR, etc.)  │ │
│  │  • Time-driven recalculations                        │ │
│  │  • Web App endpoint (JSON API for Vercel)            │ │
│  └──────────────────────┬──────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────┘
                          │ HTTPS (JSON)
                          │
┌─────────────────────────▼───────────────────────────────┐
│              VERCEL (Free Tier) — READ-ONLY UI          │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Next.js App Router                      │ │
│  │  /status        → Self-Service Lookup (public)       │ │
│  │  /dashboard     → Finance Dashboard (read-only)      │ │
│  │  /reports       → Report Viewer (read-only)          │ │
│  │  /submissions   → All Submissions (read-only)        │ │
│  │  /year-end      → FY Rollover Checklist (read-only)  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Responsibility Boundary

| Layer | Responsibility | Writes Data? |
|---|---|---|
| **Google Forms** | Data entry for receipts and mileage | Yes (to Form Responses sheets) |
| **Google Sheets** | Database — all data lives here | Yes (manual edits by finance team) |
| **Apps Script** | Workflow engine — all business logic, state machine, side effects | Yes (programmatic writes to all sheets) |
| **Apps Script Web App** | JSON API endpoint serving pre-computed dashboard data | No (read-only endpoint) |
| **Vercel / Next.js** | Read-only presentation layer — displays data, no writes | **No** |
| **Google Drive** | File storage for receipts and documents | Yes (file moves by Apps Script) |

> **Critical Design Principle**: Vercel is strictly read-only. All data mutations (approvals, status changes, CR creation, expense moves) happen in Google Sheets via Apps Script. The Next.js app fetches and displays data only.

### 1.3 Data Flow: Vercel ↔ Google Sheets

```
Vercel Server Component
  → fetch() to Apps Script Web App URL (deployed as "Execute as: Me", "Anyone can access")
  → Apps Script reads from Sheets, computes KPIs/aggregations
  → Returns JSON response
  → Next.js renders Server Components with data
  → Client receives HTML (no credentials exposed)
```

**Authentication to Sheets API**: The Apps Script Web App runs under the deployer's Google account. No service account or API key is needed — the Web App URL itself is the authenticated endpoint. The URL should be treated as a secret (stored in Vercel environment variables) because anyone with the URL can read dashboard data.

**Environment Variable**:
```
APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/{deployment_id}/exec
```

### 1.4 Access Model

| Actor | Access Method | Auth Required? | Can Write? |
|---|---|---|---|
| Club member checking status | Vercel `/status` page, enters their email | No auth — email-gated lookup | No |
| Finance Coordinator | Google Sheets directly (shared to their Google account) | Google account (sheet sharing) | Yes (limited — see §1.5) |
| Finance Director | Google Sheets directly (shared to their Google account) | Google account (sheet sharing) | Yes (full) |
| Vercel dashboard viewer | Vercel `/dashboard`, `/reports`, `/submissions`, `/year-end` | **Password-gated** (see §1.6) | No |
| Apps Script | Runs as deployer's account | Implicit (deployment credential) | Yes |

> The self-service `/status` page is intentionally public — members enter their email to see their own records. All other Vercel pages are protected by a shared password gate (§1.6).

### 1.6 Vercel Password Gate

All Vercel pages except `/status` are protected by a lightweight password gate that uses a **signed, short-lived token** — the raw password is never placed in a URL or resent on data requests.

**Handshake flow**:
1. On first visit to a protected route (`/dashboard`, `/reports`, `/submissions`, `/year-end`), the user sees a full-page password prompt styled to match the design system.
2. The password is sent via **HTTP POST** (never GET/query string) to the Apps Script endpoint `action=authCheck`.
3. Apps Script compares it against a **salted hash** of the `Dashboard Password` setting (the plaintext is never logged or reflected back), then returns a signed token: `HMAC-SHA256(payload, secret)` where `payload = { exp: now + 7days }` and `secret` is a Script Property.
4. The token is stored in **`localStorage`** (key: `surge-auth`) with its expiry. The user is not re-prompted for 7 days (configurable), even across tab closes — this removes the constant re-entry friction of `sessionStorage`. (**X5**)
5. Every subsequent data request sends the **token** (not the password) in the `Authorization` header. Apps Script validates the HMAC + expiry. Invalid/expired → `{ "error": "unauthorized" }`, and the client re-prompts. (**S2**)
6. **Brute-force protection**: `authCheck` is rate-limited to 5 attempts/min/IP (tracked in `CacheService`). The secret can be rotated at any time to revoke all outstanding tokens.

**Default password**: `Spendy-Otter` (configurable in Settings sheet; stored only as a hash for comparison — see implementation note).

> **Why a token, not the raw password on every call**: Query-string passwords leak via Apps Script execution logs, proxy logs, and browser history, and resending on every request multiplies exposure. A single POST handshake + signed token limits the password to one transmission and makes access revocable by rotating the secret. (**S2**)

**Why not full auth**: This is internal club financial data (not PII or banking data), and the Vercel site is read-only. A shared password + signed token provides meaningful, revocable access control with zero external dependencies, within Vercel's free tier.

> **Design Priority**: The Vercel site exists to provide a faster, more responsive, and more visually polished experience than the legacy GAS web app. Performance, reliability, and visual quality are first-class requirements, not just nice-to-haves.

### 1.5 Finance Role Permissions (in Google Sheets)

| Action | Coordinator | Director |
|---|---|---|
| Set Coordinator Approval (col P) | ✅ | ✅ |
| Set Director Approval (col Q) | ❌ (blocked by data validation in Sequential mode) | ✅ |
| Set Rejection Reason (col V) | ✅ | ✅ |
| Set Standardized Project / Category / Verified Amount | ✅ | ✅ |
| Run "Move to Expenses" menu action | ✅ | ✅ |
| Run "Create Cheque Requisition" menu action | ✅ | ✅ |
| Run "Cancel CR" menu action | ❌ | ✅ |
| Delete rows from any sheet | ✅ (with confirmation dialog) | ✅ |
| Edit Settings sheet | ❌ | ✅ |
| Run "Year-End Rollover" menu action | ❌ | ✅ |

> **Implementation**: Coordinator vs. Director distinction is enforced by Apps Script checking `Session.getActiveUser().getEmail()` against the `CoordinatorNames` and `DirectorNames` lists in Settings. Dangerous operations (Cancel CR, Year-End Rollover, Settings edits) show a permission error dialog for Coordinators.

---

# PART 2: DATA SCHEMA

---

## §2 Sheet Registry

| Constant Key | Sheet Name | Display Order | Purpose | V2 Changes |
|---|---|---|---|---|
| `SETTINGS` | `Settings` | 1 | Key-value config + configurable lists | Added new settings |
| `APPROVAL_QUEUE` | `Approval Queue` | 2 | Receipt reimbursement intake & dual-approval | Added `Last Modified`; locking via LockService |
| `MILEAGE_APPROVALS` | `Mileage Approvals` | 3 | Driving reimbursement intake & single-approval | Transactional atomic move |
| `EXPENSES` | `Expenses` | 4 | Unified expense ledger (receipts + mileage) | Removed On-Behalf-Of; added Expense Type + Fiscal Year |
| `CR_TRACKER` | `CR Tracker` | 5 | Cheque Requisition lifecycle | Added `Cancelled` status; `Last Modified` |
| `GRANTS` | `Grants` | 6 | Grant applications & utilization | Added `Appeal Amount Approved` |
| `BUDGETS` | `Budgets` | 7 | Project budget tracking | Formulas refined |
| `RECONCILIATION` | `Reconciliation` | 8 | CR payment matching (two-section layout) | Added `Actual Amount Received` |
| `AUDIT_LOG` | `Audit Log` | 9 | Immutable action trail | Enhanced user capture |
| `DASHBOARD_DATA` | `Dashboard Data` | 10 | Pre-computed summaries (write-through cache) | Expanded for Vercel |
| `FORM_RESPONSES` | `Form Responses 1` | 11 | Raw Google Form data (receipt) | Unchanged |
| `MILEAGE_RESPONSES` | `Form Responses 2` | 12 | Raw Google Form data (mileage) | Unchanged |
| `ARCHIVE` | `Archive` | 13 | Prior-FY terminal records; mirrors Expenses schema | **Restored (reliable) — D4** |

> **RESTORED (reliable) — D4**: The `Archive` sheet returns, but with a robust, opt-in design (see §5.17). It mirrors the Expenses schema exactly and holds only fully-terminal records from **prior fiscal years**. Current and previous FY records always stay live in `Expenses`. Reports that span archived periods transparently union `Expenses + Archive`, so the original concern (year-end reports missing archived rows) is resolved.
> **REMOVED**: `CR_LINE_ITEMS` reserved constant (never implemented).

---

## §2.1 ID Format Patterns

### Row ID (Approval Queue, Expenses, Mileage Approvals)

| Property | Value |
|---|---|
| Format | `EXP-{base36_timestamp}-{4_random_chars}` |
| Generation | `"EXP-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6)` |
| Case | Uppercase (`.toUpperCase()`) |
| Example | `EXP-LXQZ5K2A-B3F9` |
| Uniqueness | Timestamp-based + random suffix — practically unique |

### CR Number

| Property | Value |
|---|---|
| Format Template | Configurable via `CR Numbering Format` setting |
| Default | `CR-{FY}-{###}` |
| `{FY}` token | 4-digit fiscal year code: last 2 digits of start year + last 2 of end year (e.g., `2526`) |
| `{###}` token | Zero-padded 3-digit sequential number per fiscal year |
| Start Number | Configurable via `CR Numbering Start` (default: `1`) |
| Sequencing | Auto-incremented: highest existing number for current FY + 1 |
| Example | `CR-2526-001`, `CR-2526-002` |

### Grant ID

| Property | Value |
|---|---|
| Format | User-defined (no auto-generation) |

---

## §2.2 Sheet: `Form Responses 1` — Receipt Reimbursement Form

> Auto-created by Google Forms. Read-only from the application's perspective. **Unchanged from V1.**

| Col | Form Field Name (exact `namedValues` key) | Data Type |
|---|---|---|
| 0 | `Timestamp` | datetime (auto) |
| 1 | `Full Name` | string |
| 2 | `Email Address for Interac e-Transfer Reimbursement` | string (email) |
| 3 | `Event / Project Name` | string |
| 4 | `Date of Purchase (as shown on receipt)` | date |
| 5 | `Amount Paid (CAD) (no $ symbol)` | number |
| 6 | `Vendor / Store Name` | string |
| 7 | `Describe the Expense (what and why?)` | string |
| 8 | `Was this pre-approved or part of a planned purchase?` | string (dropdown) |
| 9 | `Upload Receipt (PDF or Image)` | URL (Google Drive) |
| 10 | `Additional Notes (Optional)` | string |

---

## §2.3 Sheet: `Form Responses 2` — Mileage/Driving Reimbursement Form

> Auto-created by a second Google Form. Read-only. **Unchanged from V1.**

| Col | Form Field Name (exact) | Data Type |
|---|---|---|
| 0 | `Timestamp` | datetime (auto) |
| 1 | `Full Name` | string |
| 2 | `Email Address for Interac e-Transfer Reimbursement` | string (email) |
| 3 | `Event / Project Name` | string |
| 4 | `Date of Travel` | date |
| 5 | `Distance Traveled (km)` | number (float) |
| 6 | `Reimbursement Rate` | string (dropdown: `Standard` or `Custom`) |
| 7 | `Custom Rate ($/km)` | number (float, optional) |
| 8 | `Upload Supporting Document (Optional)` | URL (Google Drive, optional) |
| 9 | `Additional Notes (Optional)` | string |

---

## §2.4 Sheet: `Approval Queue` — 24 Columns

### Column Groups (color-coded headers)

| Range | Group | Header Background |
|---|---|---|
| A–L (1–12) | Form data | `#1565c0` (blue) |
| M–N (13–14) | Auto-detected | `#6a1b9a` (purple) |
| O–W (15–23) | Finance team | `#2e7d32` (green) |
| X (24) | System | `#424242` (gray) |

### Column Definitions

| Col | Header (exact) | Type | Source | Validation / Notes |
|---|---|---|---|---|
| A | `Row ID` | string | Auto | Format: `EXP-{base36}-{4rand}` uppercase |
| B | `Timestamp` | datetime | Form | Submission timestamp |
| C | `Full Name` | string | Form | |
| D | `Email (e-Transfer)` | string (email) | Form | |
| E | `Event/Project (Submitted)` | string | Form | Raw event name from form |
| F | `Purchase Date` | date | Form | |
| G | `Amount (CAD)` | number (currency) | Form | Parsed via `parseAmount()` |
| H | `Vendor` | string | Form | |
| I | `Description` | string | Form | |
| J | `Pre-Approved?` | string | Form | |
| K | `Receipt File` | URL/hyperlink | Form | Formula: `=HYPERLINK("url", "📎 View Receipt")` |
| L | `Additional Notes` | string | Form | |
| M | `Duplicate Flag` | string | Formula | `=IF(AND(COUNTIFS(G:G,G{row},H:H,H{row},F:F,F{row})>1,ROW()>1),"⚠️ DUPLICATE","")` — also overwritten by batch check |
| N | `Receipt Age (Days)` | string | Computed | `⚠️ {n} days old` if > threshold, else `{n} days` |
| O | `Coordinator Approval` | string | Manual | **Dropdown**: `list_CoordinatorNames`. Special: `Rejected` |
| P | `Director Approval` | string | Manual | **Dropdown**: `list_DirectorNames`. Special: `Rejected`. **Blocked by data validation until col O is filled (Sequential mode)** |
| Q | `Approval Status` | string | Computed | Calculated from O+P. See §3. Terminal: `Moved to Expenses`, `Rejected` |
| R | `Standardized Project` | string | Manual | **Dropdown**: `list_ProjectNames` |
| S | `Assigned Category` | string | Manual | **Dropdown**: `list_ExpenseCategories` |
| T | `Verified Amount (CAD)` | number (currency) | Manual | Finance-corrected amount |
| U | `Rejection Reason` | string | Manual | Entering text → auto-reject; clearing → revert |
| V | `Internal Notes` | string | Manual | |
| W | `Source Row` | string | System | For undo: stores the original AQ Row ID when moved (matched by ID, not index). Hidden column. |
| X | `Last Modified` | datetime | System | Timestamp of the most recent programmatic write. Used for staleness detection on Vercel and audit context. **Concurrency is enforced by `LockService`, not by this field** (see §3.3g). Hidden column. |

> **V2 Changes from V1:**
> - **Removed**: `On-Behalf-Of` column (M). Per user decision, the submitted email always receives reimbursement. On-behalf-of detection is removed entirely.
> - **Removed**: `Auto-Approved` from Coordinator/Director approval dropdowns. Auto-approval is disabled by default.
> - **Added**: `Last Modified` column (X) — write timestamp for staleness detection and audit. Replaces the earlier "Version" concept; concurrency is handled by `LockService` serialization (§3.3g), not optimistic versioning, because human cell edits cannot be rejected after the fact.
> - **Added**: `Source Row` column (W) to support undo operations (restored by Row ID match, not row index — see §3.4d).
> - **Column letters shifted**: Duplicate Flag is now col M (was N), Receipt Age is col N (was O), etc. due to On-Behalf-Of removal.

---

## §2.5 Sheet: `Mileage Approvals` — 16 Columns

### Column Groups

| Range | Group | Header Background |
|---|---|---|
| A–K (1–11) | Submission data | `#1565c0` (blue) |
| L–O (12–15) | Review columns | `#00695c` (teal) |
| P (16) | System (hidden) | `#424242` (gray) |

### Column Definitions

| Col | Header (exact) | Type | Source | Validation / Notes |
|---|---|---|---|---|
| A | `Row ID` | string | Auto | Same format as AQ |
| B | `Timestamp` | datetime | Form | |
| C | `Full Name` | string | Form | |
| D | `Email (e-Transfer)` | string (email) | Form | |
| E | `Event/Project` | string | Form | |
| F | `Date of Travel` | date | Form | |
| G | `Distance (km)` | number (float) | Form | `0` is allowed (no guard) |
| H | `Rate Applied ($/km)` | number (float) | Computed | Standard `0.22` or custom from form |
| I | `Total Payout (CAD)` | number (currency) | Computed | `distance × rate`, rounded 2dp |
| J | `File Link` | URL/hyperlink | Form | `=HYPERLINK("url","📎 View Document")`. Optional |
| K | `Notes` | string | Form | |
| L | `Status` | string | Manual | **Dropdown**: `['Pending','Approved','Rejected']`. Also: `Moved to Expenses` (system-set) |
| M | `Reviewer` | string | Auto | `Session.getActiveUser().getEmail()` on approve/reject |
| N | `Review Date` | date | Auto | `new Date()` on approve/reject |
| O | `Review Notes` | string | Manual | |
| P | `Processed` | boolean | System | `true` after successful push to Expenses. **Column hidden**. Default: `false` |

### V2 Mileage Integration Design

**Problem (V1)**: Two concurrent `Approved` edits could both read `Processed = false` and insert duplicate Expenses rows.

**Solution (V2)**: Atomic, **transactional** read-modify-write using `LockService`. The full Expenses row is assembled in memory and written with a single `appendRow()` *after* validation — never a partial multi-step write that could leave a half-row.

```
onEdit(col L → "Approved"):
  withLock(() => {
    1. Re-read Processed flag from sheet (fresh read inside lock)
    2. IF Processed = true → toast "Already processed", exit
    3. Build the complete Expenses row object in memory
       (validate all fields; if invalid → toast + exit, nothing written)
    4. expensesSheet.appendRow(rowObject)         // single atomic write
    5. Verify the append succeeded (row exists, Row ID matches)
    6. Set Processed = true
    7. Set Status = "Moved to Expenses"
    8. Apply visual formatting (green bg, gray font)
    9. logToAudit('MOVE_TO_EXPENSES')
    ON ERROR before step 4:  nothing written — safe, no rollback needed
    ON ERROR at/after step 4: if the appended row exists but later steps failed,
       leave Processed=true (the Expenses row IS present) and log ERROR for
       manual review — NEVER reset Processed to false after a successful append,
       to avoid creating a duplicate on the next approval.
  })
```

> **Why this ordering (F5)**: V1/early-V2 set `Processed=true` *before* copying, so a failure mid-copy followed by a `Processed=false` rollback could create a second Expenses row on retry. Building the row in memory and committing it with one `appendRow()` means the operation either fully succeeds or writes nothing — the duplicate window is closed.

**Self-Service Integration**: Members see both receipt and mileage reimbursements on the same `/status` page. The unified view pulls from Expenses (where approved mileage records land) and from Mileage Approvals (for pending items). The `Type` field distinguishes them visually (`Receipt` vs `Mileage` badge).

---

## §2.6 Sheet: `Expenses` — 23 Columns

| Col | Header (exact) | Type | Source | Validation / Notes |
|---|---|---|---|---|
| A | `Row ID` | string | From AQ/Mileage | Preserved from source |
| B | `Timestamp` | datetime | From AQ/Mileage | Original submission time |
| C | `Full Name` | string | Copied | |
| D | `Email (e-Transfer)` | string (email) | Copied | This is always the reimbursement recipient |
| E | `Standardized Project` | string | AQ col R (or E fallback) | **Dropdown**: `list_ProjectNames` |
| F | `Purchase Date` | date | Copied | |
| G | `Verified Amount (CAD)` | number (currency) | AQ col T (or AQ col G fallback) | `COALESCE(AQ.VerifiedAmount, AQ.SubmittedAmount)` |
| H | `Vendor` | string | Copied | Mileage: hardcoded `Mileage Reimbursement` |
| I | `Description` | string | Copied | Mileage: `Mileage: {dist}km @ ${rate}/km` |
| J | `Category` | string | AQ col S | **Dropdown**: `list_ExpenseCategories`. Mileage: `Mileage` |
| K | `Pre-Approved?` | string | Copied | Mileage: `N/A – Mileage` |
| L | `Receipt File` | URL/hyperlink | Copied | HYPERLINK formula preserved |
| M | `Funding Source` | string | Manual | **Dropdown**: `list_FundingSources`. Mileage default: `Club Bank Account` |
| N | `Cheque Requisition #` | string | System | Links to CR Tracker (e.g., `CR-2526-001`). Clearable for unlink. |
| O | `Reimbursement Status` | string | Auto/Manual | **Dropdown**: `list_ReimbursementStatuses`. Default: `Approved` |
| P | `Payment Date` | date | Auto/Manual | Auto-set on `Reimbursed` or `Payment Received` |
| Q | `Payment Method` | string | Manual | **Dropdown**: `list_PaymentMethods`. Mileage: `E-Transfer (from club account)` |
| R | `Payee` | string | Config default | `cfg.defaultPayee` (Finance Director Name) |
| S | `Status Age (Days)` | number | Computed | Days since timestamp |
| T | `Follow-Up Flag` | string | Computed | `🟡 FOLLOW UP: ...` or `🔴 URGENT: ...` |
| U | `Internal Notes` | string | Manual | |
| V | `Expense Type` | string | System | **V2 NEW**. `Receipt` or `Mileage`. Set automatically by `moveRowToExpenses()` / `moveMileageToExpenses()`. For bulk-pasted legacy data, defaults to `Receipt` if blank. Used for self-service type badges, chart filtering, and progress bar variant selection. |
| W | `Fiscal Year` | string | Computed | **V2 NEW**. e.g., `FY 2025–2026`. Derived from Purchase Date using FY boundary logic (§5.4). Populated by Apps Script on row creation and refreshed during time-driven recalculations. Enables simple `WHERE FY = currentFY` filtering instead of date range math. |

> **V2 Changes from V1:**
> - **Removed**: `On-Behalf-Of` column. The submitted email is always the reimbursement recipient.
> - **Removed**: Archiving. All expenses stay in this sheet permanently. Use fiscal year filters for scoping.
> - **Added**: `Expense Type` column (V) — distinguishes `Receipt` vs `Mileage` without fragile vendor-name string matching.
> - **Added**: `Fiscal Year` column (W) — computed FY label for simplified filtering across KPIs, reports, and charts.
> - `Verified Amount (CAD)` (col G) is populated as `COALESCE(AQ.VerifiedAmount, AQ.SubmittedAmount)` — if finance left Verified Amount blank in AQ, the submitted amount is used.
> - `Cheque Requisition #` (col N) can be manually cleared to unlink an expense from a CR. Clearing triggers recalculation of the CR's total and expense count, and reverts the expense status to `Approved`.
> - Column letters shifted due to On-Behalf-Of removal.

---

## §2.7 Sheet: `CR Tracker` — Dynamic Column Count

### Fixed Columns (A–P)

| Col | Header (exact) | Type | Source | Validation / Notes |
|---|---|---|---|---|
| A | `CR Number` | string | Auto | See §2.1 for format |
| B | `Date Created` | date | Auto | `new Date()` on creation |
| C | `Cheque Payable To` | string | Config default | `cfg.defaultCRPayee` |
| D | `Total Amount` | number (currency) | Computed | Sum of linked expense verified amounts. **Auto-recalculated when expenses are linked/unlinked.** |
| E | `Description` | string | Auto | Template: `Reimbursement for {Event} expenses — {Count} items totaling ${Amount}` |
| F | `Delivery Method` | string | Manual | **Dropdown**: `['Pick up on campus','Mail on campus','Mail off campus']` |
| G | `Picked Up By` | string | Manual | **Dropdown**: `list_AuthorizedChequePickups` |
| H | `Status` | string | Manual | **Dropdown**: `list_CRStatuses`. Default: `Draft` |
| I | `Submitted By` | string | Manual | **Dropdown**: `list_AuthorizedCRSubmitters` |
| J | `Date Submitted` | date | Manual | |
| K | `Date Cheque Received` | date | Manual | |
| L | `# Expenses` | number (int) | Auto | Count of linked expenses. **Auto-recalculated on link/unlink.** |
| M | `Status Age (Days)` | number | Computed | Days since Date Submitted (or Date Created) |
| N | `Follow-Up Flag` | string | Computed | See §4.11 |
| O | `Notes` | string | Manual | |
| P | `Last Modified` | datetime | System | Write timestamp for staleness detection and audit. Concurrency enforced by `LockService` (§3.3g), not versioning. Hidden. |

### Dynamic Funding Source Columns (Q+)

One column per entry in `list_FundingSources`:

| Header Pattern | Type | Default |
|---|---|---|
| `FS: {FundingSourceName}` | number (currency) | `0` |

Default columns: `FS: SFSS Club Grant`, `FS: SFSS Resource Funding`, `FS: Club Bank Account`, `FS: Trust Fund`, `FS: External Sponsorship`, `FS: Other`

### Final Column (after all FS columns)

| Header | Type | Formula |
|---|---|---|
| `Funding Total Check` | string | `=IF(SUM(fs_cols)=D{row},"✅ Match","❌ Mismatch: " & TEXT(SUM,"$#,##0.00") & " vs " & TEXT(D{row},"$#,##0.00"))` |

> **V2 Changes**: Added `Last Modified` column (P) for staleness/audit (concurrency via `LockService`). Added `Cancelled` to `list_CRStatuses`. CR Total and # Expenses are now auto-recalculated whenever an expense is linked or unlinked.

---

## §2.8 Sheet: `Grants` — 20 Columns

| Col | Header (exact) | Type | Source | Validation / Notes |
|---|---|---|---|---|
| A | `Grant ID` | string | Manual | User-entered |
| B | `Grant Name / Source` | string | Manual | **FK key** → matched against `Expenses.Funding Source` |
| C | `Grant Type` | string | Manual | **Dropdown**: `list_GrantTypes` |
| D | `Application Date` | date | Manual | |
| E | `Amount Requested` | number (currency) | Manual | |
| F | `Status` | string | Manual | **Dropdown**: `list_GrantStatuses`. See §3.7 |
| G | `Amount Approved` | number (currency) | Manual | Original approved amount (never overwritten by appeal) |
| H | `Amount Spent` | number (currency) | Computed | Sum of non-rejected Expenses where Funding Source = Grant Name |
| I | `Amount Remaining` | number (currency) | Computed | `max(0, EffectiveApproved − Spent)` where EffectiveApproved = `Appeal Amount Approved` if set, else `Amount Approved` |
| J | `Utilization %` | string | Computed | `{n}%` = `round((spent / effectiveApproved) * 100)` |
| K | `Utilization Bar` | string | Computed | `█████░░░░░░░░░░░░░░░ 25%` (20-char bar) |
| L | `Appeal Details` | string | Manual | |
| M | `Appeal Date` | date | Manual | |
| N | `Appeal Amount` | number (currency) | Manual | Amount requested in appeal |
| O | `Appeal Amount Approved` | number (currency) | Manual | **V2 NEW**. Actual amount approved after appeal. Kept separate from original `Amount Approved` (col G) for audit trail. When set, this becomes the effective approved amount for utilization calculations. |
| P | `Follow-Up Date` | date | Computed | Set to today when flag active |
| Q | `Follow-Up Flag` | string | Computed | See §4.10 |
| R | `Pre-Approved?` | string | Manual | **Dropdown**: `['Y','N']` |
| S | `Fiscal Year` | string | Manual | e.g., `FY 2025–2026` |
| T | `Notes` | string | Manual | |

> **V2 Changes**: Added `Appeal Amount Approved` (col O). The `Amount Remaining` and `Utilization %` formulas now use `COALESCE(Appeal Amount Approved, Amount Approved)` as the effective approved amount. This preserves the original approval amount for reference while correctly tracking post-appeal utilization.

---

## §2.9 Sheet: `Budgets` — 11 Columns

| Col | Header (exact) | Type | Source | Validation / Notes |
|---|---|---|---|---|
| A | `Event / Project` | string | Manual | **Dropdown**: `list_ProjectNames` |
| B | `Allocated Budget` | number (currency) | Manual | |
| C | `Amount Spent` | number (currency) | Computed | Sum of non-rejected Expenses by project |
| D | `Amount Committed` | number (currency) | Computed | Sum from AQ (Pending/Coord Approved/Dir Approved) by project. Uses `COALESCE(Verified Amount, Submitted Amount)`. |
| E | `Amount Remaining` | number (currency) | Computed | See §4.8 — formula changes based on toggle |
| F | `Utilization %` | string | Computed | See §4.8 — formula changes based on toggle |
| G | `Health Bar` | string | Computed | `█████▓▓░░░░░░░░░░░░░ 35%` (█=spent, ▓=committed, ░=empty) |
| H | `Funding Source(s)` | string | Manual | **Dropdown**: `list_FundingSources` |
| I | `Status` | string | Auto/Manual | **Dropdown**: `list_BudgetStatuses`. See §3.8 |
| J | `Fiscal Year` | string | Manual | |
| K | `Notes` | string | Manual | |

> **V2 Clarification**: `Amount Committed` uses `COALESCE(AQ.VerifiedAmount, AQ.SubmittedAmount)` — Verified Amount takes precedence when present.

---

## §2.10 Sheet: `Reconciliation` — Two-Section Layout

### Section 1: CR Reconciliation (Row 1 = title, Row 2 = headers, Row 3+ = data)

> **V2 (F11)**: CRs with status `Cancelled` are **excluded** from Reconciliation §1 entirely — no row is generated for them, and they are omitted from all reconciliation math. A cancelled CR has no expected cheque, so it must never appear as a permanent "shortfall."

| Col | Header (exact) | Type | Source |
|---|---|---|---|
| A | `CR Number` | string | From CR Tracker |
| B | `Expected Amount` | number (currency) | CR Tracker.Total Amount |
| C | `Cheque Received?` | string | Computed: `Y` if CR status ∈ {`Cheque Received`, `Distributed`}, else `N` |
| D | `Date Received` | date | CR Tracker.Date Cheque Received |
| E | `Actual Amount Received` | number (currency) | **V2 NEW**. Manual entry — the actual cheque amount. Defaults to Expected Amount when Cheque Received status is set, but can be overridden by finance if the cheque amount differs. |
| F | `Supplementary Source` | string | **V2 NEW**. Manual — describes where the shortfall was covered from (e.g., "Trust Fund", "Bank Account"). Only relevant when Actual ≠ Expected. |
| G | `Supplementary Amount` | number (currency) | **V2 NEW**. Manual — amount supplemented from other sources to cover the full CR total. |
| H | `Discrepancy` | number (currency) | Formula: `Actual Amount Received − Expected Amount` |
| I | `Discrepancy Flag` | string | `⚠️ Mismatch` if `|discrepancy| > 0.01`, else `✅ Match` |
| J | `Total Available` | number (currency) | **V2 NEW**. `Actual Amount Received + Supplementary Amount`. Should equal Expected Amount for full coverage. |
| K | `Coverage Flag` | string | **V2 NEW**. `✅ Fully Covered` if `|Total Available − Expected| ≤ 0.01`, else `⚠️ Shortfall: $X` |
| L | `Distributed?` | string | `Y` if received AND all linked expenses status = `Reimbursed` |
| M | `Notes` | string | Manual |

### Section 2: Payment Distribution (Row 20 = title, Row 21 = headers, Row 22+ = data)

| Col | Header (exact) | Type | Source |
|---|---|---|---|
| A | `Payment Source (CR#)` | string | Expenses.CR# or `Direct` if none |
| B | `Payee` | string | Expenses.Full Name |
| C | `Amount Paid` | number (currency) | Expenses.Verified Amount |
| D | `Date Paid` | date | Expenses.Payment Date |
| E | `Payment Method` | string | Expenses.Payment Method |
| F | `Linked Expense IDs` | string | Expenses.Row ID |
| G | `Reconciled?` | string | `Y` if expense status = `Reimbursed` |
| H | `Notes` | string | Manual |

> **Payment Distribution Generation (V2)**: Section 2 rows are auto-generated by a time-driven function that scans for expenses with status `Reimbursed` or `Payment Received` that do not yet have a matching row in Section 2 (matched by Row ID). This covers both CR-based and direct payment expenses. Finance can manually add/edit rows for corrections.

---

## §2.11 Sheet: `Audit Log` — 9 Columns

| Col | Header (exact) | Type | Notes |
|---|---|---|---|
| A | `Timestamp` | string | Formatted: `MMM D, YYYY, h:mm AM/PM` |
| B | `User` | string | Actual human user, captured with a fallback chain (**S7**): `Session.getActiveUser().getEmail()` → if blank, `Session.getEffectiveUser().getEmail()` → if still blank (common in some trigger/cross-domain contexts), the form submitter's email (for form events) → else literal `unknown@edit`. **Never** records the deployer/service identity for human edits, and **never** logs a blank User. |
| C | `Action` | string | See §3.10 for action types |
| D | `Sheet` | string | Sheet name constant |
| E | `Record ID` | string | Row ID or CR Number |
| F | `Field` | string | Column header name (optional) |
| G | `Old Value` | string | Previous value (optional) |
| H | `New Value` | string | New value or descriptive message |
| I | `Details` | string | Reserved (typically empty) |

> Sheet is protected (warning-only) — only script writes to it.

---

## §2.12 Sheet: `Settings` — Configuration Store

### Key-Value Section (cols A–E)

| Col | Header | Type |
|---|---|---|
| A | `Setting` | string |
| B | `Value` | varies |
| C | `Description` | string |
| D | `Default` | varies |
| E | `Type` | string: `Text`, `Number`, `Toggle`, `Dropdown`, `Color` |

**Toggle validation**: dropdown `['Y', 'N']`

**Dropdown validations** (exact allowed values):

| Setting Name | Allowed Values |
|---|---|
| `Approval Mode` | `Independent`, `Sequential`, `Both Required` |
| `Approval Queue Sort Order` | `Newest First`, `Oldest First` |
| `Date Format in Filenames` | `YYYY-MM-DD`, `MM-DD-YYYY`, `DD-MM-YYYY` |
| `Organize by Folders` | `Flat (all in root)`, `By Fiscal Year`, `By Event/Project`, `By Fiscal Year then Event`, `By Status` |
| `Dashboard Default Date Range` | `Current Fiscal Year`, `Current Term`, `Current Month`, `Last 30 Days`, `Last 90 Days`, `Custom` |
| `Chart Type Preference` | `Bar`, `Pie`, `Doughnut`, `Stacked Bar` |
| `Follow-Up Check Frequency` | `Hourly`, `Daily`, `Weekly` |
| `Default Cheque Delivery` | `Pick up on campus`, `Mail on campus`, `Mail off campus` |

### V2 New/Changed Settings

| Setting | Default | Type | Description |
|---|---|---|---|
| `Dashboard Password` | `Spendy-Otter` | Text | **V2 NEW**. Password required to access Vercel dashboard pages (all routes except `/status`). Change at any time — takes effect immediately on next login attempt. |
| `Auto-Approve Threshold` | `$0` (disabled) | Number | **V2: Disabled by default.** Set > 0 to enable. When enabled, submissions at or below this amount skip human review. |
| `Auto-Approve Enabled` | `N` | Toggle | **V2 NEW**. Master switch. Even if threshold > 0, auto-approval only fires when this is `Y`. |
| `Allow Over Budget Submissions` | `Y` | Toggle | **V2: Always `Y`.** Over-budget submissions are always allowed. This setting is retained for schema compatibility but should not be changed. |
| `Enable Duplicate Detection` | `Y` | Toggle | Advisory duplicate flagging. When `Y`, batch check runs and flags potential duplicates. Duplicates are never auto-rejected — flags are informational for finance review. |
| `Enable Archiving` | `N` | Toggle | **V2 (restored, reliable — D4)**. When `Y`, the year-end rollover archives prior-FY terminal records to the Archive sheet. Disabled by default; archiving never runs silently. |
| `Keep Live Fiscal Years` | `2` | Number | **V2 NEW**. How many fiscal years (current + N−1) stay in the live Expenses sheet. Older terminal records are eligible for archiving. Default `2` = current + previous FY always live. |

### Settings Configurability Design (V2 Note)

> **Critical Design Principle**: The Settings sheet must be trivially configurable by non-technical finance team members. Adding a new event name, expense category, or funding source should never require editing code or redeploying anything.

**How configurable lists work**:
- Each list (e.g., `LIST: ProjectNames`) is a simple vertical column of values in the Settings sheet.
- To **add** an item: type the new value in the next blank cell below the list. Apps Script picks it up automatically on the next `onEdit` or time-driven trigger.
- To **rename** an item: edit the cell in place. Apps Script detects the rename and offers a cascading rename dialog across all referencing sheets (see §E4 in state machine).
- To **remove** an item: delete the cell and shift cells up. Existing records referencing the removed value retain their current value (no orphan breakage) — the dropdown just won't offer it for new entries.
- **No redeployment needed** for any list change. The Vercel dashboard reads lists from the Dashboard Data cache, which refreshes on the next time-driven cycle (default: daily at 9 AM, or manually via "Refresh Dashboard Data" menu action).

**Adding a new setting**: New key-value settings can be added by inserting a row in the key-value section. Apps Script reads settings by key name (`getSettingValue('myNewSetting')`), so new keys are automatically available to any script function that references them.

### Configurable Lists Section

Stored as vertical items in column B with header `LIST: {ListName}` in column A. Named ranges: `list_{ListName}`.

| List Name | Default Values |
|---|---|
| `ExpenseCategories` | `Marketing`, `Logistics`, `Food & Beverage`, `Prizes`, `Tech & Equipment`, `Printing`, `Travel`, `Venue`, `Decorations`, `Miscellaneous` |
| `ProjectNames` | `StormHacks 2026`, `Club Social — Fall`, `Workshop Series`, `General Operations` |
| `FundingSources` | `SFSS Club Grant`, `SFSS Resource Funding`, `Club Bank Account`, `Trust Fund`, `External Sponsorship`, `Other` |
| `PaymentMethods` | `Cheque (via CR)`, `E-Transfer (from club account)`, `E-Transfer (via Finance Director)` |
| `GrantTypes` | `SFSS Club Grant`, `SFSS Resource Funding`, `External Grant`, `Sponsorship`, `Other` |
| `CRStatuses` | `Draft`, `Ready to Submit`, `Submitted`, `Follow Up`, `Action Required`, `Approved by SFSS`, `Cheque Received`, `Distributed`, `Cancelled` |
| `ReimbursementStatuses` | `Approved`, `CR Draft`, `CR Ready to Submit`, `CR Submitted`, `Awaiting Payment`, `Follow Up Required`, `Action Required`, `Payment Received`, `Reimbursed`, `Rejected / Cancelled` |
| `ApprovalStatuses` | `Pending`, `Coordinator Approved`, `Director Approved`, `Fully Approved`, `Rejected` |
| `GrantStatuses` | `Applied`, `Under Review`, `Approved`, `Partially Approved`, `Appealed`, `Appeal Approved`, `Denied` |
| `BudgetStatuses` | `Planning`, `Active`, `Closed`, `Over Budget` |
| `SelfServiceVisibleFields` | `Name`, `Date`, `Vendor`, `Amount`, `Status` |
| `TermDateRanges` | `May 1 – Aug 31`, `Sep 1 – Dec 31`, `Jan 1 – Apr 30` |
| `CoordinatorNames` | *(user-configured)* |
| `DirectorNames` | *(user-configured)* |
| `AuthorizedCRSubmitters` | *(user-configured)* |
| `AuthorizedChequePickups` | *(user-configured)* |
| `PreApprovedOptions` | `Yes – pre-approved`, `No – but urgent or necessary`, `No – forgot to ask` |

> **V2 Changes**: `CRStatuses` now includes `Cancelled` and `Action Required`. `ReimbursementStatuses` now includes `Action Required`. Auto-approval settings restructured with master toggle.

---

## §2.13 Data Relationships (Foreign Keys)

```
Form Responses 1 ──onFormSubmit──→ Approval Queue         (1:1, Row ID shared)
Form Responses 2 ──onFormSubmit──→ Mileage Approvals      (1:1, Row ID shared)

Approval Queue ──moveToExpenses──→ Expenses               (1:1, Row ID preserved)
Mileage Approvals ──moveToExpenses──→ Expenses             (1:1, Row ID preserved)

Expenses.Cheque Requisition #  → CR Tracker.CR Number      (many:1)
Expenses.Funding Source        → Grants.Grant Name / Source (many:1, lookup by name)
Expenses.Standardized Project  → Budgets.Event / Project   (many:1, lookup by name)
AQ.Standardized Project        → Budgets.Event / Project   (many:1, for committed calc)

CR Tracker ──status change──→ Expenses.Reimbursement Status (1:many, cascade)
CR Tracker.CR Number → Reconciliation §1.CR Number          (1:1)
Expenses.Row ID → Reconciliation §2.Linked Expense IDs      (1:1)
```

> **FK Integrity Note (V2)**: All FK relationships remain string-matched by name. This is acceptable because event/project names include the year suffix (e.g., "StormHacks 2026") ensuring uniqueness, and grant names follow the same convention. Apps Script validates FK references on write operations (Move to Expenses, CR creation) and surfaces warnings for orphaned references during time-driven recalculations.

---

## §2.14 Computed Column Strategy — Formula vs Script (V2 — F6)

Every "Computed" column must declare **how** it is computed, because the choice determines freshness guarantees. Two mechanisms exist:

- **Formula** — a live spreadsheet formula (typically `ARRAYFORMULA` in row 1 or per-row). Always current; recalculates instantly on any dependency change; no trigger needed. Use for cheap, self-contained row math.
- **Script** — written by Apps Script during `onEdit` and/or time-driven recalculation. Can do cross-sheet aggregation that formulas handle poorly, but is only as fresh as its last run.

> **Important**: `COALESCE` is **not** a native Sheets function. Where a computed column is Formula-based, the spec's `COALESCE(Verified, Submitted)` shorthand must be implemented as `IF(verified<>"", verified, submitted)`.

| Sheet.Column | Mechanism | Refresh Trigger |
|---|---|---|
| AQ.`Duplicate Flag` | Formula (inline `COUNTIFS`) + Script (batch cross-check) | Live + onEdit batch |
| AQ.`Receipt Age` | Script | onEdit + daily |
| AQ.`Approval Status` | Script (mode logic) | onEdit (locked) |
| Expenses.`Status Age` | Formula (`=TODAY()-Timestamp`) | Live |
| Expenses.`Follow-Up Flag` | Script | onEdit + every 5 min |
| Expenses.`Fiscal Year` | Script | onEdit (Purchase Date) + daily (F7) |
| Expenses.`Expense Type` | Script (set on move) | Move to Expenses |
| CR Tracker.`Total Amount`, `# Expenses` | Script | onEdit link/unlink + every 5 min |
| CR Tracker.`Status Age` | Formula | Live |
| CR Tracker.`Funding Total Check` | Formula (`IF(SUM(fs)=D,...)`) | Live |
| Grants.`Amount Spent`, `Remaining`, `Utilization %`, `Bar` | Script (cross-sheet sum) | every 5 min + onEdit |
| Budgets.`Amount Spent`, `Committed`, `Remaining`, `Utilization %`, `Health Bar` | Script (cross-sheet sum) | every 5 min + onEdit |
| Reconciliation §1 `Discrepancy`, `Total Available` | Formula | Live |
| Reconciliation §1 `Cheque Received?`, `Distributed?`, `Coverage Flag` | Script | every 5 min |

> Cross-sheet aggregations (budgets, grants, CR totals) are Script-based because formula-based cross-sheet sums over a growing ledger are slow and brittle. They refresh on the same 5-minute cadence as the dashboard cache (§6.1), plus immediately on the relevant `onEdit`.

---

# PART 3: STATE MACHINE

---

## §3.1 Entity Status Fields

| Entity | Sheet | Status Column | Header |
|---|---|---|---|
| Receipt Reimbursement (approval phase) | Approval Queue | Q | `Approval Status` |
| Receipt Reimbursement (expense phase) | Expenses | O | `Reimbursement Status` |
| Mileage Reimbursement | Mileage Approvals | L | `Status` |
| Cheque Requisition | CR Tracker | H | `Status` |
| Grant | Grants | F | `Status` |
| Budget | Budgets | I | `Status` |

---

## §3.2 Status Value Enumerations

### 3.2a Approval Queue — `Approval Status`

| Status Value (exact string) | Classification |
|---|---|
| `Pending` | Initial/default |
| `Coordinator Approved` | Intermediate |
| `Director Approved` | Intermediate (out-of-sequence — blocked in Sequential mode) |
| `Fully Approved` | Terminal (eligible for move) |
| `Rejected` | Terminal (reversible by clearing Rejection Reason) |
| `Moved to Expenses` | Terminal (irreversible except via undo) |

> **V2 Change**: `Auto-Approved` status removed from the enumeration. Auto-approval is disabled by default. When enabled, it sets both approvals to the coordinator/director name and proceeds through normal `Fully Approved` flow.

**Terminal status behavior**: `Moved to Expenses` is never overwritten. `Rejected` can be reversed by clearing the Rejection Reason (col U), which triggers recalculation from cols O+P.

### 3.2b Expenses — `Reimbursement Status`

| Status Value | Typical Source |
|---|---|
| `Approved` | Initial when moved from AQ/Mileage |
| `CR Draft` | CR created |
| `CR Ready to Submit` | CR status propagation |
| `CR Submitted` | CR status propagation |
| `Awaiting Payment` | CR status propagation |
| `Follow Up Required` | CR status propagation |
| `Action Required` | **V2 NEW**. CR status propagation from CR `Action Required` |
| `Payment Received` | CR status propagation |
| `Reimbursed` | CR status propagation / manual |
| `Rejected / Cancelled` | Manual |

### 3.2c Mileage Approvals — `Status`

| Status Value | Source |
|---|---|
| `Pending` | Initial on form submission |
| `Approved` | Manual edit (triggers auto-move) |
| `Rejected` | Manual edit |
| `Moved to Expenses` | System-set after move |

**Dropdown only shows**: `Pending`, `Approved`, `Rejected`. `Moved to Expenses` is set programmatically.

### 3.2d CR Tracker — `Status`

| Status Value | V2 Notes |
|---|---|
| `Draft` | |
| `Ready to Submit` | |
| `Submitted` | |
| `Follow Up` | SFSS requested follow-up |
| `Action Required` | **V2 NEW**. Club needs to take action (missing forms, additional info requested by SFSS) |
| `Approved by SFSS` | |
| `Cheque Received` | |
| `Distributed` | |
| `Cancelled` | **V2 NEW**. CR cancelled — linked expenses revert to `Approved` |

### 3.2e Grants — `Status`

Unchanged from V1:
`Applied`, `Under Review`, `Approved`, `Partially Approved`, `Appealed`, `Appeal Approved`, `Denied`

### 3.2f Budgets — `Status`

Unchanged from V1:
`Planning` (manual; never auto-overridden), `Active` (auto when spending > 0), `Closed` (manual only; never auto-overridden), `Over Budget` (auto when utilization ≥ over-limit %)

---

## §3.3 Approval Queue Transitions

### 3.3a Approval Mode Logic

Three configurable modes control how Coordinator (col O) and Director (col P) approvals combine:

| Mode | Coordinator Only | Director Only | Both | Neither |
|---|---|---|---|---|
| `Independent` | `Fully Approved` if director not required; else `Coordinator Approved` | `Fully Approved` | `Fully Approved` | `Pending` |
| `Sequential` | `Coordinator Approved` | **BLOCKED** (data validation prevents Director input until Coordinator is filled) | `Fully Approved` | `Pending` |
| `Both Required` | `Coordinator Approved` | `Director Approved` | `Fully Approved` | `Pending` |
| *(default/other)* | `Fully Approved` | `Fully Approved` | `Fully Approved` | `Pending` |

> If **either** approval = `Rejected`, overall status = `Rejected` (overrides all modes).

**V2 Sequential Mode Enforcement**: In `Sequential` mode, the Director Approval column (col P) has data validation that prevents input while Coordinator Approval (col O) is blank. This is enforced via Apps Script `onEdit`: if the edit is to col P and col O is empty and mode is Sequential, the edit is rejected (value cleared) and a toast message is shown: "Coordinator must approve first in Sequential mode."

### 3.3b Complete Transition Table

| From | To | Trigger | Guard | Side Effects |
|---|---|---|---|---|
| *(new row)* | `Pending` | `onFormSubmit` | `autoPopulateQueue=true` | `logToAudit('FORM_SUBMISSION')`, file rename/move with error handling (see §3.3d) |
| `Pending` | `Coordinator Approved` | `onEdit` col O/P | hasCoord && !hasDirector (per mode rules) | `logToAudit('APPROVAL')`, touch Last Modified |
| `Pending` | `Director Approved` | `onEdit` col O/P | !hasCoord && hasDirector (non-Sequential modes only) | `logToAudit('APPROVAL')`, touch Last Modified |
| `Pending` | `Fully Approved` | `onEdit` col O/P | Both approved OR single suffices per mode | `logToAudit('APPROVAL')`, touch Last Modified |
| `Pending` | `Rejected` | `onEdit` col O/P | Either = `Rejected` | `logToAudit('REJECTION')`, touch Last Modified |
| `Coordinator Approved` | `Fully Approved` | `onEdit` col P | Director approval added | `logToAudit('APPROVAL')`, touch Last Modified |
| `Director Approved` | `Fully Approved` | `onEdit` col O | Coordinator approval added | `logToAudit('APPROVAL')`, touch Last Modified |
| Any non-terminal | `Rejected` | `onEdit` col U | Rejection Reason text entered | `logToAudit('REJECTION')`, touch Last Modified |
| `Rejected` | *(recalculated)* | `onEdit` col U | Rejection Reason cleared | Recalculate from O+P, touch Last Modified |
| `Fully Approved` | `Moved to Expenses` | Menu action | status = `Fully Approved` | Copy to Expenses (status=`Approved`), gray out AQ row, `logToAudit('MOVE_TO_EXPENSES')` |
| `Moved to Expenses` | `Pending` | Menu: "Undo Move" | Director-only permission | Restore AQ row formatting, delete corresponding Expenses row, `logToAudit('UNDO_MOVE_TO_EXPENSES')` |

### 3.3c Clearing Approvals (V2 New)

| Action | Result |
|---|---|
| Coordinator clears col O (sets to blank) | Approval Status recalculates from scratch using current O+P values. If P is also blank → `Pending`. If P has a value → depends on mode. |
| Director clears col P (sets to blank) | Same recalculation. If O has a value → `Coordinator Approved` (or `Fully Approved` in Independent mode if director not required). |

The recalculation function runs the same mode-based logic as initial approval. Terminal statuses (`Moved to Expenses`) are never affected by clearing.

### 3.3d Rejection Mechanism Interlock (V2 Fix)

**Problem (V1)**: Two independent rejection paths (col O/P dropdown `Rejected` vs. col U text) could conflict.

**V2 Resolution**: 
- Entering text in col U (Rejection Reason) takes precedence — immediately sets status to `Rejected` regardless of col O/P values.
- Setting col O or P to `Rejected` also sets status to `Rejected`.
- Clearing col U: if col O or P still says `Rejected`, status remains `Rejected`. Status only reverts when BOTH col U is empty AND neither O nor P says `Rejected`.
- Clearing a `Rejected` dropdown in col O or P: if col U has text, status remains `Rejected`. Only recalculates when col U is also empty.

### 3.3e Auto-Approve Rule (V2 — Disabled by Default)

```
Master switch: cfg.autoApproveEnabled (default: N)
Threshold: cfg.autoApproveThreshold (default: $0)

IF autoApproveEnabled = Y AND threshold > 0 AND amount ≤ threshold:
    coordinator_approval = first name from CoordinatorNames list
    director_approval = first name from DirectorNames list
    approval_status = "Fully Approved"
    → immediately move to Expenses
    logToAudit('AUTO_APPROVE')
```

> **V2 Change**: Auto-approval is disabled by default via a master toggle. Even with a threshold > $0, nothing auto-approves unless `Auto-Approve Enabled` is set to `Y`. When auto-approval fires, it uses real coordinator/director names (not "Auto-Approved" string) so all downstream logic treats the row identically to a manually approved one.

### 3.3f File Operations Error Handling (V2 New)

All file operations (rename, move to folder) during `onFormSubmit` are wrapped in try-catch:

```
try:
    renameFile(fileId, newName)
    moveFileToFolder(fileId, targetFolder)
catch (error):
    logToAudit('ERROR', {
        action: 'FILE_OPERATION',
        details: error.message,
        recordId: rowId
    })
    // Continue processing — file operation failure does NOT
    // block the form submission from being added to AQ.
    // The receipt URL still works; only the file name/location
    // may be inconsistent.
```

Similarly, file moves on status change (§3.4c) use the same pattern: failure is logged but does not roll back the status change.

### 3.3g Concurrency Control via LockService (V2 — F1, F2)

**All status-mutating handlers acquire a script lock before reading or writing.** This is the single concurrency mechanism for the system — there is no optimistic versioning (a human cell edit cannot be rejected after the keystroke).

Handlers that must lock:
- Approval recalculation (`onEdit` on cols O, P, U in Approval Queue)
- Rejection / rejection-clear recalculation
- CR status cascade to linked expenses (1:many write)
- Move to Expenses (single and batch)
- Mileage move to Expenses
- CR creation, CR cancellation, expense unlink
- Expense / CR row-deletion recalculation

```
function withLock(fn):
    lock = LockService.getScriptLock()
    if not lock.tryLock(10000):   // wait up to 10s
        toast("System busy — please retry in a moment.")
        return
    try:
        fn()                       // re-read fresh values INSIDE the lock
    finally:
        lock.releaseLock()
```

Every locked write also stamps `Last Modified = new Date()` on the affected row for staleness/audit purposes.

> **Why locking, not versioning**: Two directors editing cols O and P simultaneously each fire `onEdit`. Without a lock both could read the same pre-edit state and recompute a stale `Approval Status`, clobbering each other. Serializing the recalculation closes this race. A `Version` counter cannot — there is no point at which a user's edit can be safely "rejected and retried."

### 3.3h Bulk-Paste / Multi-Cell Edit Handling (V2 — F3)

The migration constraint requires bulk copy-paste of legacy data. A paste fires `onEdit` **once** with a multi-cell `e.range`, not once per cell. All `onEdit` handlers must therefore be range-aware:

```
onEdit(e):
    withLock(() => {
        affectedRows = unique row indices in e.range
        affectedCols = columns in e.range
        for each affectedRow:
            if any of {O, P, U} ∈ affectedCols:
                recalculateApprovalStatus(affectedRow)   // per-row
            if Purchase Date col ∈ affectedCols:
                recomputeFiscalYear(affectedRow)          // F7
            // ...other per-row recalcs
    })
```

**Bulk-paste safety rules**:
- Pasting into computed/system columns (`Approval Status`, `Last Modified`, `Fiscal Year`, hidden cols) is ignored/overwritten on the next recalc — these are never authoritative from a paste.
- Pasting raw legacy rows into Expenses: `Expense Type` defaults to `Receipt` if blank; `Fiscal Year` is computed from the pasted Purchase Date; missing Verified Amount falls back to submitted via the COALESCE rule.
- A paste that spans 500+ rows triggers a "Recalculating N rows…" toast and processes in a single locked batch to avoid trigger timeouts.

---

## §3.4 Expense Reimbursement Status Transitions

### 3.4a CR Status → Expense Status Propagation Map

| CR Status (changed to) | Expense Status (set to) |
|---|---|
| `Ready to Submit` | `CR Ready to Submit` |
| `Submitted` | `CR Submitted` |
| `Follow Up` | `Follow Up Required` |
| `Action Required` | `Action Required` |
| `Approved by SFSS` | `Awaiting Payment` |
| `Cheque Received` | `Payment Received` |
| `Distributed` | `Reimbursed` |
| `Cancelled` | `Approved` (reverts to pre-CR state) |

> `Draft` does **not** propagate.  
> **V2 New**: `Action Required` propagates to expenses. `Cancelled` reverts linked expenses to `Approved` and clears their CR# field (col N).

### 3.4b Complete Transition Table

| From | To | Trigger | Guard | Side Effects |
|---|---|---|---|---|
| *(from AQ)* | `Approved` | `moveRowToExpenses()` | — | Row created in Expenses |
| *(from Mileage)* | `Approved` | `moveMileageToExpenses()` | — | Funding=`Club Bank Account`, Payment=`E-Transfer` |
| `Approved` | `CR Draft` | Menu: Create CR | Status = `Approved`, max-per-CR check | Sets CR# in col N, `logToAudit('CR_CREATED')` |
| `CR Draft` | `CR Ready to Submit` | CR status cascade | CR# matches | — |
| `CR Ready to Submit` | `CR Submitted` | CR status cascade | CR# matches | — |
| `CR Submitted` | `Follow Up Required` | CR status cascade | CR# matches | — |
| `CR Submitted` | `Action Required` | CR status cascade | CR# matches | — |
| `CR Submitted` | `Awaiting Payment` | CR status cascade | CR# matches | — |
| `Follow Up Required` | `Awaiting Payment` | CR status cascade | CR# matches | — |
| `Action Required` | `Awaiting Payment` | CR status cascade | CR# matches | — |
| `Awaiting Payment` | `Payment Received` | CR status cascade | CR# matches | Auto-set Payment Date |
| `Payment Received` | `Reimbursed` | CR status cascade | CR# matches | Auto-set Payment Date |
| Any with CR# | `Approved` | CR Cancelled cascade | CR# matches | Clear CR# (col N), `logToAudit('CR_CANCELLED')` |
| Any | `Reimbursed` | Manual edit | — | Auto-set Payment Date, file → `Paid` folder |
| Any | `Payment Received` | Manual edit | — | Auto-set Payment Date, file → `Paid` folder |
| Any | `Rejected / Cancelled` | Manual edit | — | File → `Rejected` folder |

### 3.4c Unlinking an Expense from a CR (V2 New)

Finance can manually clear the `Cheque Requisition #` field (col N) on an Expense row to unlink it from a CR.

**Side effects of clearing col N**:
1. Expense status reverts to `Approved`
2. CR Tracker row for the old CR# is recalculated: `Total Amount` and `# Expenses` are recomputed from remaining linked expenses
3. CR `Description` template is regenerated
4. `logToAudit('CR_UNLINK', { crNumber, expenseId })`

**Guard**: Cannot unlink if the CR status is `Cheque Received` or `Distributed` (cheque already issued). Toast error: "Cannot unlink — cheque already received for this CR."

### 3.4d Undo Move to Expenses (V2 New)

A "Revert to Approval Queue" menu action is available for expenses that were incorrectly moved.

**Guards**:
- Expense status must be `Approved` (cannot revert if CR has been created or any further processing occurred)
- Director-only permission

**Side effects** (all within a script lock):
1. Locate the original AQ row by **Row ID match** (search col A for the stored `Source Row` ID), never by a stored row index — row indices shift when rows are inserted/deleted. (**F8**)
2. Restore the AQ row formatting (remove gray-out, restore original background)
3. Set AQ Approval Status back to `Fully Approved`
4. Delete the Expenses row
5. `logToAudit('UNDO_MOVE_TO_EXPENSES', { expenseId })`

> If the original AQ row cannot be found by ID (e.g., it was deleted), the undo aborts with a toast: "Original Approval Queue row not found — cannot auto-restore. The Expenses row was left unchanged." No partial restore is performed.

### 3.4e Side Effects on Any Expense Status Change

1. `logToAudit('STATUS_CHANGE')`
2. Update Status Age (col S) in days
3. If `Awaiting Payment` and weeks ≥ `paymentFollowUpWeeks` → set follow-up flag
4. If `Reimbursed` or `Payment Received` → auto-fill Payment Date (if blank)
5. If `cfg.moveFilesOnStatusChange` → move receipt file (with error handling):
   - `Approved`, `CR Draft`, `CR Ready to Submit` → folder `Approved`
   - `Reimbursed`, `Payment Received` → folder `Paid`
   - `Rejected / Cancelled` → folder `Rejected`
   - All others → folder `Pending`
   - **On failure**: log error to Audit Log, do NOT rollback the status change. Show toast: "Status updated but file move failed — please move the file manually."

---

## §3.5 Mileage Approval Transitions

| From | To | Trigger | Guard | Side Effects |
|---|---|---|---|---|
| *(new row)* | `Pending` | `onFormSubmit` | — | `logToAudit('FORM_SUBMISSION')` |
| `Pending` | `Approved` | Manual edit col L | — | Auto-fill Reviewer + Review Date; acquire lock; move to Expenses (see §2.5) |
| `Approved` | `Moved to Expenses` | Automatic (within lock) | `Processed ≠ true` | Copy to Expenses (status=`Approved`), set `Processed=true`, green bg, gray font, `logToAudit('MOVE_TO_EXPENSES')` |
| `Pending` | `Rejected` | Manual edit col L | — | Auto-fill Reviewer + Review Date, `logToAudit('REJECTION')` |

---

## §3.6 CR Tracker Transitions

All transitions are **manual edits** of col H (dropdown enforced).

| From | To | Side Effects |
|---|---|---|
| *(created)* | `Draft` | Links expenses (status → `CR Draft`), `logToAudit('CR_CREATED')` |
| `Draft` | `Ready to Submit` | Propagates `CR Ready to Submit` to linked expenses |
| `Ready to Submit` | `Submitted` | Propagates `CR Submitted` |
| `Submitted` | `Follow Up` | Propagates `Follow Up Required` |
| `Submitted` | `Action Required` | **V2 NEW**. Propagates `Action Required` to linked expenses |
| `Follow Up` | `Approved by SFSS` | Propagates `Awaiting Payment` |
| `Follow Up` | `Action Required` | **V2 NEW**. Propagates `Action Required` |
| `Action Required` | `Submitted` | **V2 NEW**. After resolving the action item, re-submit. Propagates `CR Submitted` |
| `Action Required` | `Approved by SFSS` | **V2 NEW**. SFSS approves after action taken. Propagates `Awaiting Payment` |
| `Submitted` | `Approved by SFSS` | Propagates `Awaiting Payment` |
| `Approved by SFSS` | `Cheque Received` | Propagates `Payment Received` |
| `Cheque Received` | `Distributed` | Propagates `Reimbursed` |
| Any non-terminal | `Cancelled` | **V2 NEW**. Reverts linked expenses to `Approved`, clears their CR# field, `logToAudit('CR_CANCELLED')`. Director-only. |

Every CR status change: `logToAudit('CR_STATUS_CHANGE')` + cascade to linked expenses.

> **V2 CR Lifecycle Enhancement**: The `Action Required` status represents situations where SFSS has requested additional information or forms from the club. This is distinct from `Follow Up` (where the club is following up with SFSS on a pending decision). The flow allows: `Submitted → Action Required → Submitted` (resubmit after providing info) or `Submitted → Action Required → Approved by SFSS` (approved after providing info).

> **V2 CR Cancellation**: When a CR is cancelled, all linked expenses are cleanly reverted to `Approved` status with their CR# cleared. This allows them to be grouped into a new CR if needed. The cancelled CR row remains in CR Tracker for audit trail purposes (not deleted).

---

## §3.7 Grant Transitions (All Manual)

```
Applied → Under Review → Approved
                       → Partially Approved → Appealed → Appeal Approved
                       → Denied
```

Side effects (computed by `recalculateGrantUtilization()`):
- `Applied` / `Under Review`: follow-up flag if > `grantFollowUpDays` (default 14)
- `Partially Approved`: appeal window countdown
- `Denied`: optionally hidden from dashboard
- `Appeal Approved`: utilization calculations switch to using `Appeal Amount Approved` (col O) as the effective approved amount

---

## §3.8 Budget Transitions (Semi-Automated)

| From | To | Trigger | Guard |
|---|---|---|---|
| *(new row)* | `Planning` | Manual entry | — |
| `Planning` | `Active` | Auto (`recalculateBudgetSpending`) | **spent > 0** (committed alone does NOT trigger — V2 fix) |
| `Active` | `Over Budget` | Auto (`recalculateBudgetSpending`) | utilization ≥ `budgetOverLimitPercent` |
| Any | `Closed` | Manual only | Never auto-overridden |

> **V2 Change**: A budget in `Planning` status only auto-transitions to `Active` when actual spending occurs (`spent > 0`). Committed amounts (pending AQ items) alone do not trigger the transition. This resolves the V1 contradiction where `Planning` could be overridden by committed-only activity.

---

## §3.9 Time-Driven Automated Changes

Registered trigger frequency: configurable (`Hourly` / `Daily` default 9AM / `Weekly` Monday 9AM).

| Action | What Changes | Affects Status? |
|---|---|---|
| `refreshExpenseFollowUpFlags()` | Recalculates Follow-Up Flag (col T) | **No** — flag only |
| `refreshCRFollowUpFlags()` | Recalculates CR Follow-Up Flag (col N) | **No** — flag only |
| `recalculateGrantUtilization()` | Recalculates grant metrics + flags | **No** — flag only |
| `recalculateBudgetSpending()` | Recalculates budget spending + status | **Yes** — `Planning→Active` (if spent > 0), `Active→Over Budget` |
| `refreshDashboardData()` | Recomputes Dashboard Data sheet for Vercel | N/A |
| `generatePaymentDistribution()` | Auto-creates Reconciliation §2 rows for newly reimbursed expenses | N/A |
| `cleanOldAuditEntries()` | Deletes audit entries > retention period | N/A |
| `validateReceiptLinks()` | **V2 NEW**. Checks receipt files via Drive API (by file ID); flags broken/trashed files in Audit Log | **No** — flag only |

> **V2 Archiving (restored, reliable — D4)**: `archiveOldRecords()` is **not** on the routine time-driven schedule. It runs only as part of the Director-initiated **Year-End Rollover** action (or a manual "Archive Prior Years" menu item), gated by `Enable Archiving = Y`. See §5.17 for the transactional, verified archive procedure.

### Row Deletion Cascade Protection (V2 New — C3)

An `onChange` trigger (type: `EDIT` / `REMOVE_ROW`) on the Expenses sheet detects row deletions:

1. On any row deletion in Expenses, the trigger fires.
2. The script scans the deleted row data (captured via the change event) for a CR# value.
3. If a CR# was present:
   - Immediately recalculate the CR's `Total Amount`, `# Expenses`, and `Description` from remaining linked expenses.
   - If no linked expenses remain, the CR total becomes `$0.00` and a warning flag is set in Notes: "⚠️ All expenses removed — consider cancelling this CR."
4. Log `ROW_DELETED` to Audit Log with the deleted row's ID, CR# (if any), and amount.
5. Before deletion, a confirmation dialog is shown: "This expense ($350.00) is linked to **CR-2526-003**. Deleting it will reduce the CR total from $1,200.00 to $850.00. Continue?" [Yes / No]

For rows NOT linked to a CR, the deletion proceeds with a simpler confirmation: "Delete this expense record? This cannot be undone." [Yes / No]

---

## §3.10 Audit Log Action Types

| Action Type | When Logged |
|---|---|
| `FORM_SUBMISSION` | New receipt or mileage form submitted |
| `APPROVAL` | Approval status set (non-Pending, non-Rejected) |
| `REJECTION` | Status set to Rejected (AQ or Mileage) |
| `AUTO_APPROVE` | Amount below auto-approve threshold (when enabled) |
| `MOVE_TO_EXPENSES` | Row moved from AQ or Mileage to Expenses |
| `UNDO_MOVE_TO_EXPENSES` | **V2 NEW**. Move reverted — expense deleted, AQ restored |
| `STATUS_CHANGE` | Reimbursement Status changed in Expenses |
| `CR_CREATED` | New CR created from selected expenses |
| `CR_STATUS_CHANGE` | CR status changed |
| `CR_CANCELLED` | **V2 NEW**. CR cancelled — expenses unlinked |
| `CR_UNLINK` | **V2 NEW**. Single expense unlinked from CR |
| `CELL_EDIT` | General cell edit (if `auditLogEdits` enabled) |
| `ROW_DELETED` | **V2 NEW**. Expense or CR row deleted (with CR recalc if linked) |
| `ARCHIVE` | **V2 (restored)**. Prior-FY terminal record copied to Archive and removed from Expenses |
| `SETTING_RENAME_CASCADE` | **V2 NEW**. Settings list value renamed across referencing rows |
| `SETTING_DELETE` | **V2 NEW**. Settings list value deleted (reassigned or kept-as-orphan) |
| `ERROR` | Error in any handler (with details) |
| `FILE_ERROR` | **V2 NEW**. File operation failed (rename, move) |

---

## §3.11 Cross-Entity Flow Summary (V2)

```
[Google Form 1: Receipt]
     → Form Responses 1
     → Approval Queue (Pending)
        ↳ [Optional] Auto-Approve if enabled & threshold met → Fully Approved → Expenses
     → Approval Queue (Fully Approved via Coordinator + Director)
     → Expenses (Approved)
     → CR grouped (CR Draft → Ready to Submit → Submitted → 
        [Follow Up | Action Required] → Approved by SFSS → 
        Cheque Received → Distributed = Reimbursed)
     OR → Direct payment (Approved → Reimbursed via manual status + Payment Date)

[Google Form 2: Mileage]
     → Form Responses 2
     → Mileage Approvals (Pending)
     → Approved → auto-move to Expenses (Approved)
     → Direct payment path (no CR — E-Transfer from club account)
     → Reimbursed

[CR Tracker] ← created from Expenses
     → status changes cascade back to linked Expenses
     → Cancellation reverts linked Expenses to Approved

[Grants] — independent lifecycle, linked via funding source name
[Budgets] — independent lifecycle, linked via project name
[Reconciliation] — aggregation from CR Tracker + Expenses (auto-generated + manual)
```

---

# PART 4: UI/FORMATTING RULES

---

## §4.1 Design System — CSS Custom Properties

> **Retained from V1 in full.** The complete design system (color palettes, shadows, border radii, typography, transitions) is carried forward unchanged. The Next.js implementation uses CSS custom properties on `<html>` with `data-theme` attribute switching.

### 4.1a Color Palette — Dark Mode (Default)

| Variable | Value | Usage |
|---|---|---|
| `--color-bg` | `#0f1117` | Page background |
| `--color-surface` | `#1a1d27` | Card backgrounds |
| `--color-surface-2` | `#242833` | Input backgrounds, table header bg |
| `--color-surface-3` | `#2e3240` | Progress bar track, hover states |
| `--color-border` | `rgba(255,255,255,0.08)` | All borders |
| `--color-text` | `#e8eaed` | Primary text |
| `--color-text-secondary` | `#9aa0a6` | Labels, card titles |
| `--color-text-muted` | `#6b7280` | Timestamps, help text |
| `--color-primary` | `#6366f1` | Primary brand (Indigo-500) |
| `--color-primary-light` | `#818cf8` | Hover states, lighter accents |
| `--color-accent` | `#06b6d4` | Accent (Cyan-500) |
| `--color-success` | `#34d399` | Success states |
| `--color-warning` | `#fbbf24` | Warning states |
| `--color-danger` | `#f87171` | Error/danger states |
| `--color-info` | `#60a5fa` | Info states |
| `--glass-bg` | `rgba(26,29,39,0.8)` | Glassmorphism backgrounds |
| `--glass-border` | `rgba(255,255,255,0.08)` | Glass element borders |
| `--card-bg` | `#1a1d27` | Alias for card background |
| `--nav-height` | `60px` | Nav bar height |

### 4.1b Color Palette — Light Mode (`[data-theme="light"]`)

| Variable | Value |
|---|---|
| `--color-bg` | `#f5f7fa` |
| `--color-surface` | `#ffffff` |
| `--color-surface-2` | `#f0f2f5` |
| `--color-surface-3` | `#e4e7ec` |
| `--color-border` | `rgba(0,0,0,0.08)` |
| `--color-text` | `#1a1d27` |
| `--color-text-secondary` | `#4b5563` |
| `--color-text-muted` | `#6b7280` |
| `--glass-bg` | `rgba(255,255,255,0.9)` |
| `--glass-border` | `rgba(0,0,0,0.08)` |
| `--card-bg` | `#ffffff` |

### 4.1c–g Shadows, Border Radii, Typography, Transitions, Theme Persistence

> All values retained identically from V1 §3.1c–g. See V1 specification for complete tables.

---

## §4.2 Status Color Mappings

> All status color mappings retained from V1 §3.2a–e with additions for new statuses:

### V2 Additions to Status Badge Colors

| Status | Background | Text Color |
|---|---|---|
| `Action Required` | `rgba(251,146,60,0.15)` | `#fb923c` |

### V2 Additions to Self-Service Status Details

| Internal Status | Display Label | Progress (of 8) | Ribbon Color | Icon |
|---|---|---|---|---|
| `Action Required` | Action Needed | 5 | `#FFE0B2` | 🔧 |

### V2 Additions to Pipeline Status → Badge Class

| Status | Badge Class |
|---|---|
| `Action Required` | `warning` |

> All other status color mappings from V1 §3.2 are retained unchanged.

### V2 Additions to Spreadsheet Conditional Formatting (D1)

| Status | Sheet | Row Background |
|---|---|---|
| `Action Required` | CR Tracker (col H) | `#FFE0B2` (orange — same family as Follow Up) |
| `Action Required` | Expenses (col O) | `#FFE0B2` (orange) |
| `Cancelled` | CR Tracker (col H) | `#E0E0E0` (gray — same as Rejected) |

### V2 "Fully Approved" Visual Distinction in AQ (D2)

**Spreadsheet**: `Fully Approved` rows in the Approval Queue receive a **bold left border accent** — 4px solid `#2e7d32` (dark green) on column A — in addition to the existing `#D4EDDA` green background. This creates a visual "ready to action" lane that finance can instantly scan for.

**Vercel Dashboard**: `Fully Approved` status badges on the All Submissions page receive a subtle single-cycle pulse animation on initial render (0.6s ease-out, scale 1.0 → 1.05 → 1.0) to draw attention to actionable items.

---

## §4.3 All V1 UI Rules Retained

The following V1 sections are retained in full without modification:
- §3.3 Spreadsheet Header Formatting
- §3.4 Chart Configuration (Chart.js v4.4.1, 15-color palette, chart type styling, layout) — **V2 adds a 5th chart: Top Submitters (§4.5d)**
- §3.5 KPI Card Definitions (4 KPI cards with animated counters)
- §3.6 Badge CSS Classes
- §3.7 Activity Feed Dot Colors
- §3.8 Alert Card Styling
- §3.9 Progress Bars (Grant Utilization, Budget Health)
- §3.10 Self-Service Type Badges
- §3.11 Summary Card Gradient Accents
- §3.12 Header Gradient
- §3.13 Table Column Definitions Per View
- §3.15 Animations & Transitions
- §3.16 Responsive Breakpoints
- §3.17 Print Styles
- §3.18 Modal / Inspector Styling
- §3.19 PDF Export Styling
- §3.20 Auto-Refresh (300,000ms / 5 minutes)
- §3.21 Reconciliation Row Colors

> Refer to V1 specification Part 2 §3 for complete details of these sections.

---

## §4.4 Visibility & Auth Rules (V2 Redesigned)

### Next.js App Router — Routes

| Route | Page | Access Level | Data Source |
|---|---|---|---|
| `/` | Redirect | — | Redirects to `/status` |
| `/status` | Self-Service Lookup | Public — email-gated | Apps Script Web App |
| `/dashboard` | Finance Dashboard | Accessible via URL (not linked publicly) | Apps Script Web App |
| `/reports` | Report Viewer | Accessible via URL (not linked publicly) | Apps Script Web App |
| `/submissions` | All Submissions | Accessible via URL (not linked publicly) | Apps Script Web App |
| `/year-end` | FY Rollover Checklist | Accessible via URL (not linked publicly) | Apps Script Web App |

### Self-Service Data Restrictions

- **Toggle**: `cfg.selfServiceEnabled` — if false, returns "Self-service lookup is currently disabled"
- **Auth**: Email-gated — user enters their Interac e-Transfer email, sees only records matching that email
- **Email normalization (X2)**: Both the entered email and the stored email are normalized with `trim().toLowerCase()` before matching. `John.Smith@SFU.ca` matches a stored `john.smith@sfu.ca`. This eliminates the most common false-negative ("no results") for non-technical members.
- **No token/link sharing**: Members simply type their email on the page. No forgeable base64 tokens.
- **Data sources**: Approval Queue, Expenses, Mileage Approvals

**Fields EXPOSED per record**: Name, Date, Vendor, Amount, AmountDisplay, Status, Event, Description, Submitted, CRNumber, PaymentDate, PaymentMethod, ReceiptUrl, Distance (mileage), RateApplied (mileage), Type (Receipt/Mileage)

**Conditionally EXPOSED fields**:
- `Rejection Reason` (AQ col U): Shown **only** when status is `Rejected` or `Rejected / Cancelled`. Hidden for all other statuses.
- `Review Notes` (Mileage col O): Shown **only** when mileage status is `Rejected`. Serves as the rejection explanation channel for mileage submissions.

**Fields NOT EXPOSED**: Internal notes (non-rejection), coordinator/director names, audit trail, funding source, verified amount vs submitted amount

**Configurable visible fields**: `SelfServiceVisibleFields` list (default: `Name`, `Date`, `Vendor`, `Amount`, `Status`)

### Self-Service Deep Links (V2 New — S3)

Each record card has a "🔗 Copy link" icon. To avoid putting a member's email in a shareable URL (which would recreate the forgeable-token exposure we removed), the link carries **only the record ID**, not the email:
```
/status?id=EXP-LXQZ5K2A-B3F9
```
When visited, the page still prompts the visitor to enter their email, then verifies that the requested `id` belongs to that email before scrolling to and highlighting it. If the `id` doesn't belong to the entered email, it's treated as "not found" — preventing anyone from viewing a record by guessing IDs.

> **Threat-model honesty (S3)**: Email-gating provides convenience, not confidentiality — emails are guessable/known within a club. The deep link deliberately omits the email so a shared link/screenshot does not expose someone's records, and ID-guessing is blocked by the email-ownership check.

### Self-Service Error States (V2 New)

| State | Condition | Display |
|---|---|---|
| **No results** | API returns empty array for the email | "No submissions found for **[email]**. Double-check you entered the same email used on the reimbursement form." with a muted icon illustration. |
| **Service unavailable** | API call fails (timeout, 5xx, network error) | "Unable to check status right now. Please try again in a few minutes." with a retry button. |
| **Disabled** | `cfg.selfServiceEnabled = N` | "Self-service lookup is currently disabled." |
| **Loading** | API call in progress | Animated loading button (existing V1 design) with skeleton cards below. |

> **Enumeration note (S4)**: The friendly "no results for [email]" message (approved as A3) does technically confirm whether an email has submissions. Because the data is low-sensitivity internal club data, we keep the helpful message and instead mitigate mass enumeration with the `/status` rate limit and per-email cache (§6.6) rather than degrading the member experience with a vague uniform response. This is a deliberate, documented tradeoff.

### Self-Service Dynamic Progress Bar (V2 New)

The progress bar adapts based on whether the expense is on the CR path or the direct payment path:

**CR Path** (expense has a CR# assigned) — 8 steps:
```
['Submitted', 'Review', 'Approved', 'CR Filed', 'Submitted\nto SFSS', 'Awaiting\nPayment', 'Payment\nReceived', 'Reimbursed']
```

**Direct Path** (no CR# — mileage or direct-payment expenses) — 4 steps:
```
['Submitted', 'Review', 'Approved', 'Reimbursed']
```

The bar variant is selected automatically based on the `CRNumber` field being blank or populated. This prevents mileage submissions from showing 4 irrelevant CR steps in the middle of their progress bar.

**`Action Required` position (X6)**: On the CR-path bar, `Action Required` renders at **step 5** (the "Submitted to SFSS" slot) but with a distinct treatment — the 🔧 icon, amber active styling, and the sub-label changed to "Info Requested" — rather than as a separate step. This keeps the bar at 8 steps while clearly signalling that SFSS has asked the club for something. It never appears on the 4-step direct-payment bar (direct payments have no CR/SFSS interaction).

**Step mapping for Direct Path**:

| Internal Status | Progress (of 4) |
|---|---|
| `Pending` | 1 |
| `Coordinator Approved` / `Director Approved` | 1 |
| `Fully Approved` / `Approved` | 2 |
| `Payment Received` | 3 |
| `Reimbursed` | 4 |
| `Rejected` | 0 |

---

## §4.5 V2 New UI Components

### 4.5a Budget Impact Preview Modal

When a finance user clicks "Move to Expenses" on a Fully Approved AQ item, a confirmation modal appears showing the budget impact:

```
┌──────────────────────────────────────────┐
│  Budget Impact Preview                    │
│──────────────────────────────────────────│
│                                           │
│  Project: StormHacks 2026                 │
│  Expense: $350.00 (Catering - FreshPrep)  │
│                                           │
│  Current Budget:                          │
│  ┌────────────────────────────────────┐   │
│  │ Allocated:   $5,000.00             │   │
│  │ Spent:       $3,410.00             │   │
│  │ Committed:   $240.00               │   │
│  │ Remaining:   $1,350.00             │   │
│  │ Utilization: 73%                   │   │
│  └────────────────────────────────────┘   │
│                                           │
│  After this approval:                     │
│  ┌────────────────────────────────────┐   │
│  │ Spent:       $3,760.00 (+$350.00)  │   │
│  │ Remaining:   $1,000.00             │   │
│  │ Utilization: 80% ⚠️                │   │
│  └────────────────────────────────────┘   │
│                                           │
│  [Cancel]              [Confirm & Move]   │
└──────────────────────────────────────────┘
```

**Implementation**: This is a Google Sheets sidebar (HtmlService) triggered by the "Move to Expenses" menu action. It reads the budget data for the expense's Standardized Project and computes the impact preview using pure `useMemo`-style calculation. No new Sheets writes are needed.

**Behavior when no budget exists**: If the expense's Standardized Project doesn't match any Budget row, the modal shows "No budget allocated for this project" and proceeds without a budget impact section.

**Confirm-time recomputation (F4)**: The numbers shown when the modal *opens* are advisory. When the user clicks **Confirm & Move**, the move handler acquires the lock and **recomputes the budget impact from fresh data inside the lock** before writing. If the remaining budget changed since the modal opened (someone else pushed an expense while the user hesitated), the move pauses and shows: "Budget changed since you opened this — remaining is now $X (was $Y). Review and confirm again." This closes the Time-of-Check/Time-of-Use gap; the authoritative check happens at write time, never at modal-open time.

### 4.5b Fiscal Year Rollover Checklist

A read-only view (both as a Google Sheets sidebar and on Vercel at `/year-end`) showing year-end readiness:

| Checklist Item | Data Source | Condition for ✅ |
|---|---|---|
| All CRs in terminal state? | CR Tracker | COUNT of non-`Distributed` and non-`Cancelled` CRs = 0 |
| Outstanding balance resolved? | Expenses KPI | Outstanding Reimbursements = $0.00 |
| All grants resolved? | Grants | COUNT of `Applied` or `Under Review` grants = 0 |
| All budgets closed? | Budgets | COUNT of non-`Closed` budgets = 0 |
| Pending AQ items cleared? | Approval Queue | COUNT of `Pending` items = 0 |
| Mileage approvals cleared? | Mileage Approvals | COUNT of `Pending` items = 0 |
| Prior-year records archived? | Expenses / Settings | If `Enable Archiving = Y`: COUNT of archive-eligible rows still in Expenses = 0 (offers "Archive now" action). If `N`: shown as "Archiving disabled" (informational). |

**Display**: Each item shows current count and status. Items not yet resolved show the count of remaining items (e.g., "3 CRs still active") with a link/reference to the relevant sheet.

No new data, no new API calls — purely computed from existing aggregations.

### 4.5c All Submissions Search & Filter Bar (V2 New — B1)

The `/submissions` page includes a persistent toolbar above the table:

| Control | Type | Behavior |
|---|---|---|
| **Search input** | Text field | Searches across Name, Vendor, Description, Row ID, Email. Debounced (300ms). Results filtered server-side via Apps Script `?action=submissions&q=FreshPrep`. |
| **Status filter** | Dropdown | Filters by Reimbursement Status. Options: `All`, plus each status from `list_ReimbursementStatuses`. |
| **Type filter** | Dropdown | `All`, `Receipt`, `Mileage`. |

All filters are URL-param driven (`/submissions?q=FreshPrep&status=Pending&type=Receipt`) so the filtered view is shareable and bookmarkable. Filters persist across pagination.

### 4.5d Top Submitters Chart (V2 New — B2)

A 5th chart on the dashboard: **Top Submitters by Email** — a horizontal bar chart showing the top 10 reimbursement emails by total expense amount (current FY, excluding Rejected/Cancelled).

| Property | Value |
|---|---|
| Chart ID | `chartTopSubmitters` |
| Type | Horizontal Bar |
| Grouping | `Email (e-Transfer)` field from Expenses |
| Value | `SUM(COALESCE(Verified Amount, Submitted Amount))` |
| Tooltip | Shows count of expenses and outstanding (non-reimbursed) amount |
| Sort | Descending by total amount |
| Limit | Top 10 |
| Container Height | `320px` |

This uses data already fetched from the Expenses sheet. The email is displayed truncated to first initial + domain for visual privacy (e.g., `j***@sfu.ca`).

### 4.5e Dashboard Alert Cap (V2 New — B3)

The alerts section displays a maximum of **5 alerts** on initial render, sorted by severity (critical → warning → info).

If more than 5 alerts exist, a footer link reads: **"Show all X alerts ▼"** (expandable). Clicking it reveals all remaining alerts with a smooth height transition (300ms ease). The collapsed state shows a count badge next to the section title: "Alerts (12)".

### 4.5f Smart Auto-Refresh (V2 New — B4)

The 5-minute auto-refresh cycle is changed from silent data replacement to a background check:

1. Every 300,000ms, a background `fetch()` retrieves fresh data.
2. The response is compared to the currently rendered data (checksum of KPI values + alert count + pipeline counts).
3. **If data has changed**: show a non-blocking toast pinned to the bottom of the viewport: "📊 Dashboard data updated — [Refresh now]" with a button. The button triggers a full re-render with the new data.
4. **If data is unchanged**: do nothing (no toast, no visual change).
5. The auto-refresh dot still pulses green to indicate the connection is alive.

This prevents disorienting layout shifts while the user is reading charts or pipeline data.

### 4.5g Empty State Designs (V2 New — B5)

All dashboard sections have explicit empty state renders for zero-data scenarios (new fiscal year, fresh deployment, etc.):

| Section | Empty State Display |
|---|---|
| KPI cards | Show `$0.00` / `0` / `0%` with muted text styling (no animated counter). Subtitle: "No data for this period." |
| Charts (all 5) | Chart container shows a centered muted icon (📊) with text: "No expense data for this period." Background: `var(--color-surface-2)`. No Chart.js canvas rendered. |
| Activity feed | "No recent activity." with muted text. |
| Reimbursement pipeline | All status categories rendered with `0 items | $0.00`. Normal layout, zero values. |
| Alerts section | "No alerts — everything looks good! ✅" with muted success text. |
| All Submissions table | "No submissions found." with a muted illustration. If filters are active: "No results match your filters — [Clear filters]." |

### 4.5h Batch Move to Expenses (V2 New — E1, X1)

Two ways to select rows for batch move:

1. **"Move All Fully Approved"** — automatic; no manual selection. Targets every row with status `Fully Approved`.
2. **"Move Selected Rows"** — operates on the user's current selection, including **non-contiguous** rows (Ctrl/Cmd-click multiple separate rows). Implemented via `SpreadsheetApp.getActiveRangeList()` so spaced-out rows are all captured. Rows in the selection that aren't `Fully Approved` are ignored (not errors).

The flow (within a script lock):

1. **Summary modal** (HtmlService sidebar): lists every targeted row with name, vendor, amount.
2. **Budget impact aggregate**: grouped by Standardized Project (per-project, not per-item). Confirm-time recomputation applies (F4).
3. **Pre-flight validation**: rows missing Standardized Project or Category are listed in a **"Will be skipped"** section of the modal *before* the user confirms — with each Row ID and the reason — so nothing is a surprise.
4. **On confirm**: processes each eligible row (transactional append per row, gray-out, audit log).
5. **Persistent results panel (X1)**: instead of a disappearing toast, a results panel remains open listing:
   - ✅ Moved: N rows
   - ⚠️ Skipped: Row IDs + reason (e.g., "EXP-…-B3F9 — missing Category")
   
   Skipped rows are **also highlighted in the sheet** with a temporary `#FFF3CD` background and a note in `Internal Notes`: "⚠️ Skipped in batch move: assign Project/Category." This persists until the row is successfully moved, so the user can find culprits without re-reading a vanished toast.

The individual single-item "Move to Expenses" action is retained.

### 4.5i Required Field Validation Before Move (V2 New — E3)

Before any "Move to Expenses" action (single or batch), Apps Script validates:

| Field | Column | Required? | On Failure |
|---|---|---|---|
| `Standardized Project` | R | **Yes** | Toast: "Please assign a Project before moving to Expenses." Move blocked. |
| `Assigned Category` | S | **Yes** | Toast: "Please assign a Category before moving to Expenses." Move blocked. |
| `Verified Amount` | T | No | Falls back to submitted Amount (col G) via COALESCE. No warning. |

Both fields must be non-blank for the move to proceed. This prevents "Unassigned" entries in charts and ensures budget calculations can match the expense to a project.

### 4.5j Settings List Rename & Delete Cascade (V2 New — E4, S5, S6)

When a Settings list item is **edited** (rename) or **deleted** (cell cleared/removed), an `onEdit` handler on the Settings sheet detects the change via `e.oldValue` / `e.value` and scans for references across AQ (`Standardized Project`), Expenses (`Standardized Project`, `Funding Source`, `Category`), Budgets (`Event / Project`), CR Tracker (dynamic FS columns), and Grants (`Grant Name / Source`).

**Rename** (old → new, both non-empty):
- If references exist, show: "Found **12 rows** referencing 'StormHacks 2026'. Rename all to 'StormHacks 2026 - Main'?" [Yes — rename all] [No — keep old values].
- Yes → cascading rename + `logToAudit('SETTING_RENAME_CASCADE')`. No → new entries use the new name; existing rows keep the old value and a warning is logged.

**Deletion** (old non-empty, new empty) — **the dangerous case, previously unprotected (S5)**:
- If references exist, show: "**12 rows** still reference 'StormHacks 2026'. Deleting this option will orphan them and break report aggregation. Choose:"
  - **[Reassign to ▸ ___]** — pick a replacement value from the remaining list; cascades a rename to the replacement.
  - **[Keep value (orphan)]** — the option is removed from the dropdown, but existing rows keep the value **and the data-validation list is auto-extended to include the legacy value** so those cells don't falsely flag as invalid (S6). A warning is logged.
  - **[Cancel deletion]** — the deletion is undone (the value is restored).
- If **no** references exist, deletion proceeds silently.

> **S6 detail**: When a still-referenced value is removed from a list, the corresponding dropdown's data validation is rebuilt as `(current list) ∪ (legacy values in use)`. This prevents the "valid historical data marked invalid (red corner)" state that confuses finance.

### 4.5k CR Funding Validation Before Submission (V2 New — E5)

When the CR Tracker status (col H) is changed to `Ready to Submit` or `Submitted`, Apps Script checks the `Funding Total Check` column:

- If `✅ Match`: status change proceeds normally.
- If `❌ Mismatch`: status change is **blocked** (value reverted to previous status). Toast: "Cannot submit — funding source allocation ($X) doesn't match CR total ($Y). Please adjust the FS: columns first."

This prevents submitting a CR to SFSS with inconsistent funding allocation.

### 4.5l Manual Override Cross-Field Guards (V2 New — X3)

Dropdowns enforce valid status *values*, but not valid *combinations*. Soft guards (toast warnings, non-blocking) fire on `onEdit` when a manual edit creates a contradictory state, so a tired treasurer is nudged rather than silently allowed into an impossible row:

| Manual Edit | Contradiction | Guard (soft warning) |
|---|---|---|
| Expense status → `CR Submitted` / `Awaiting Payment` / etc. | No CR# in col N | "This status implies a CR, but no Cheque Requisition # is set. Did you mean to link a CR?" |
| Expense status → `Reimbursed` / `Payment Received` | Payment Date blank | Auto-fills Payment Date (existing) **and** toasts "Payment Date auto-set to today — adjust if incorrect." |
| Expense status → `Reimbursed` | No Payment Method | "Marked Reimbursed with no Payment Method — please set one for reconciliation." |
| CR status advanced past `Draft` | `# Expenses` = 0 | "This CR has no linked expenses. Link expenses before submitting." |

Guards are **warnings, not hard blocks** (except the two hard blocks already defined: Sequential-mode director gate §3.3a, and CR funding mismatch §4.5k), preserving finance's ability to make deliberate corrections while catching accidents.

### 4.5m "Ready to Move" Visual Cue & Action Discoverability (V2 New — X4)

New treasurers won't know that a green-bordered `Fully Approved` row requires running a *menu action* to advance. To close this discoverability gap:

- A live count is shown in the custom menu label itself: **"⚡ Surge Finance ▸ Move to Expenses (3 ready)"** — the number updates from a cached count of `Fully Approved` rows.
- The first time a `Fully Approved` row appears in a session, a one-time toast points to the menu: "3 items are fully approved and ready — use ⚡ Surge Finance ▸ Move to Expenses."
- The Vercel dashboard surfaces the same count as an `info` alert: "3 approvals ready to move to Expenses" (read-only reminder; the action itself happens in the sheet).

---

# PART 5: CORE CALCULATION LOGIC

---

## §5.1 Mileage / Driving Reimbursement

### Standard Rate (Single Source of Truth — F9)

The standard rate is a **Settings value**, not a hardcoded constant:

```
MileageStandardRate = getSettingValue('MileageStandardRate')   // default: 0.22 CAD/km
```

> **V2 Fix (F9)**: V1 declared `0.22` both as a hardcoded constant *and* as a configurable setting — two sources of truth. V2 reads the rate exclusively from the `MileageStandardRate` setting everywhere (form processing, Expenses description, recalculations). There is no hardcoded fallback in logic; the Settings default supplies `0.22`.

### Rate Selection

```
IF rate_type contains "custom" (case-insensitive) AND custom_rate > 0:
    rate_applied = custom_rate
ELSE:
    rate_applied = MileageStandardRate
```

> **V2 Note**: No maximum rate cap. Finance reviews and approves the final amount before moving to Expenses. A custom rate of any positive value is accepted. Distance = 0 is allowed and produces a $0.00 payout (valid edge case).

### Total Payout

```
total_payout = ROUND(distance_km × rate_applied, 2)
```

Rounding: `Math.round(value * 100) / 100`

### Mileage-Specific Business Rules

- Cannot use Cheque Requisitions — always funded from Club Bank Account via E-Transfer
- When approved: auto-moved to Expenses with fixed defaults (see §2.13)

---

## §5.2 Tax Rules

**No tax calculations exist.** No GST, PST, or HST fields. All amounts are final CAD values as submitted.

---

## §5.3 Currency Formatting & Rounding

> Retained from V1 §4.3 in full. See V1 for `formatCAD`, `parseAmount`, and rounding rules tables.

---

## §5.4 Fiscal Year & Date Handling

> Retained from V1 §4.4 in full. FY start: May 1 (configurable). Term date ranges unchanged.

---

## §5.5 Auto-Approve Logic (V2 — Disabled by Default)

```
Master switch: cfg.autoApproveEnabled (default: N)
Threshold: configurable "Auto-Approve Threshold" (default: $0 = disabled)

IF autoApproveEnabled = Y AND threshold > 0 AND amount ≤ threshold:
    Set both approval columns to real coordinator/director names
    Set Approval Status = "Fully Approved"
    → immediately move to Expenses (no human review)
    logToAudit('AUTO_APPROVE')

IF autoApproveEnabled = N OR threshold = 0:
    → normal Pending flow (no auto-approval regardless of amount)
```

> **V2 Important**: Auto-approval can be manually overridden. After an auto-approved item is moved to Expenses, a finance user can still manually change its Reimbursement Status to `Rejected / Cancelled` if the item should not have been approved. This is a standard manual status edit, not a special override.

---

## §5.6 Duplicate Detection

### Composite Key

```
key = parseAmount(amount) | trim(lowercase(vendor)) | formatDate(purchaseDate, "MMM D, YYYY")
```

### Time Window

```
window = duplicateWindowDays (default: 7 days)

Two submissions are duplicates IF:
  same key AND |submission_timestamp_A - submission_timestamp_B| ≤ window
```

### Algorithm

1. Build hash-map of all rows keyed by `amount|vendor|date`
2. Within each bucket of 2+ rows, pairwise check submission date proximity
3. Generate flags: `⚠️ DUPLICATE of Row X` or `⚠️ DUPLICATE of Rows X, Y`
4. Highlight duplicate rows with `#E1BEE7` (light purple). Clear previous highlights first.

> **V2 Design Decision**: Duplicate detection remains as an advisory system. Duplicates are never auto-rejected — the flag is informational only. Finance reviews flagged items and decides whether they are true duplicates (to be rejected) or legitimate repeat purchases. The `Enable Duplicate Detection` toggle in Settings controls whether the batch check runs.

### Inline Formula (per-row on submission)

```
=IF(AND(COUNTIFS(G:G, G{row}, H:H, H{row}, F:F, F{row}) > 1, ROW() > 1), "⚠️ DUPLICATE", "")
```

---

## §5.7 Receipt Age & Stale Warnings

> Retained from V1 §4.7 unchanged. Threshold default: 2 days.

---

## §5.8 Budget Calculations (V2 Refined)

### Budget Formula

```
Amount Spent = SUM(COALESCE(Verified Amount, Submitted Amount))
    WHERE Expenses.Standardized Project = budget project
    AND   Expenses.Reimbursement Status ≠ "Rejected / Cancelled"

Amount Committed = SUM(COALESCE(Verified Amount, Submitted Amount))
    WHERE AQ.Standardized Project = budget project
    AND   AQ.Approval Status IN ("Pending", "Coordinator Approved", "Director Approved")
    (only if "Include Committed in Budget Calc" is enabled)
```

### Two Formula Modes Based on Toggle

**When `Include Committed in Budget Calc` = Y:**
```
Amount Remaining = Allocated Budget − Amount Spent − Amount Committed
Utilization % = ROUND(((Spent + Committed) / Allocated) × 100)
```

**When `Include Committed in Budget Calc` = N:**
```
Amount Remaining = Allocated Budget − Amount Spent
Utilization % = ROUND((Spent / Allocated) × 100)
Amount Committed is still computed and displayed but NOT subtracted from Remaining
```

### Budget Health Thresholds

| Threshold | Default | Visual |
|---|---|---|
| Warning | **75%** | Amber background (`#FFE0B2`) |
| Critical | **90%** | Red background (`#F8D7DA`) |
| Over Limit | **100%** | Red background + auto-status = `Over Budget` |

### Health Bar (text-based, 20 characters)

```
spent_chars     = round((spent / max(allocated, 1)) × 20)       → █
committed_chars = round((committed / max(allocated, 1)) × 20)   → ▓  (capped so total ≤ 20)
empty_chars     = 20 - spent_chars - committed_chars             → ░
suffix          = " {utilization}%"
```

### Budget Status Auto-Rules (V2 Refined)

```
IF status = "Closed" → NEVER auto-override
IF utilization ≥ over_limit_percent → status = "Over Budget"
ELSE IF spent > 0 → status = "Active"
ELSE → status remains unchanged (stays "Planning" if nothing spent)
```

> **V2 Fix**: `Planning` only transitions to `Active` when `spent > 0`. Committed-only activity does not trigger the transition.

### Over-Budget Submission Check

```
Always allowed. The "Allow Over Budget Submissions" setting is permanently Y.
Over-budget conditions are surfaced in the Budget Impact Preview modal (§4.5a)
but never block the move to Expenses.
```

---

## §5.9 Grant Utilization (V2 Refined)

### Grant Formula

```
effective_approved = COALESCE(Appeal Amount Approved, Amount Approved)

Amount Spent = SUM(COALESCE(Verified Amount, Submitted Amount))
    WHERE Expenses.Funding Source = Grant Name / Source
    AND   Expenses.Reimbursement Status ≠ "Rejected / Cancelled"

Amount Remaining = MAX(0, effective_approved − Amount Spent)

Utilization % = ROUND((Amount Spent / effective_approved) × 100)
    (0% if effective_approved = 0)
```

### Grant Thresholds

| Threshold | Default | Visual |
|---|---|---|
| Warning | **80%** | Amber background |
| Critical | **95%** | Red background |

### Grant Utilization Bar (text-based, 20 characters)

Single-segment: `█` filled + `░` empty + ` {utilization}%`

---

## §5.10 Grant Follow-Up & Appeal Rules

> Retained from V1 §4.10 unchanged. Follow-up: 14 days. Appeal window: 30 days.

---

## §5.11 Cheque Requisition Logic

### CR Creation Rules

- Only expenses with status `Approved` (and no existing CR#) are eligible
- Max expenses per CR: configurable (default: `0` = unlimited)
- Total Amount: sum of selected expenses' Verified Amounts (using `COALESCE(Verified, Submitted)`)
- Description template: `Reimbursement for {Event} expenses — {Count} items totaling ${Amount}`
- Default payable to: Finance Director's legal name
- Initial status: `Draft`

### Funding Source Validation

```
funding_total = SUM(all FS: columns)
IF funding_total = Total Amount:
    display = "✅ Match"
ELSE:
    display = "❌ Mismatch: ${funding_sum} vs ${total}"
```

### CR Follow-Up Flags

```
reference_date = Date Submitted (or Date Created if not submitted)

IF status = "Draft" AND days_since(reference_date) > 14:
    flag = "📝 Draft for {days} days — submit or cancel?"

IF status IN ("Submitted", "Follow Up", "Action Required"):
    weeks = weeksSince(reference_date)
    IF weeks ≥ crFollowUpEscalationWeeks (default: 6):
        flag = "🔴 URGENT: {weeks} weeks since submission"
    ELIF weeks ≥ crFollowUpWeeks (default: 3):
        flag = "🟡 FOLLOW UP: {weeks} weeks since submission"
```

### CR Recalculation on Expense Link/Unlink (V2 New)

When an expense is linked to or unlinked from a CR (via CR# field change):

```
1. Recount # Expenses = COUNT(Expenses WHERE CR# = this CR Number)
2. Recompute Total Amount = SUM(COALESCE(Verified Amount, Submitted Amount)) for linked expenses
3. Regenerate Description from template
4. Recheck Funding Total Check formula
```

---

## §5.12 Expense Follow-Up / Aging

> Retained from V1 §4.12 unchanged. Payment follow-up: 2 weeks. Escalation: 4 weeks.

---

## §5.13 Reconciliation Matching (V2 Enhanced)

### CR Reconciliation

```
FOR each CR WHERE status ≠ "Cancelled":     // F11: cancelled CRs excluded
    Total Expected      = CR Tracker.Total Amount
    Cheque Received     = "Y" if status IN ("Cheque Received", "Distributed"), else "N"
    Actual Received     = Manual entry (defaults to Expected when status → Cheque Received)
    Supplementary       = Manual entry (amount from trust/bank to cover shortfall)
    Total Available     = Actual Received + Supplementary Amount
    Discrepancy         = Actual Received − Total Expected
    Discrepancy Flag    = "⚠️ Mismatch" if |discrepancy| > $0.01
    Coverage Flag       = "✅ Fully Covered" if |Total Available − Expected| ≤ $0.01
                          else "⚠️ Shortfall: ${Expected − Total Available}"
    Distributed         = "Y" if received AND ALL linked expenses status = "Reimbursed"
```

### Reconciliation Summary KPIs

| KPI | Formula |
|---|---|
| Total CRs | Count of all CRs (excluding Cancelled) |
| CRs Received | Count with status ∈ {`Cheque Received`, `Distributed`} |
| CRs Distributed | Count with status = `Distributed` |
| CRs Pending | Count with status ∈ {`Submitted`, `Follow Up`, `Action Required`, `Approved by SFSS`} |
| Total Expected | Sum of all non-cancelled CR amounts |
| Total Received | Sum of Actual Amount Received for received CRs |
| Unreimbursed Total | Sum of expense amounts where status ∉ {`Reimbursed`, `Rejected / Cancelled`} |
| Unreimbursed Count | Count of those expenses |

---

## §5.14 Dashboard KPI Aggregations

### Scope

- All KPIs scoped to **current fiscal year** (filtered by Purchase Date)
- Expenses with status `Rejected / Cancelled` are **excluded** from all totals
- **V2**: No archive sheet — all FY expenses are in the Expenses sheet, filtered by date

### KPI Definitions

| KPI | Formula |
|---|---|
| Total Expenses | SUM(COALESCE(Verified Amount, Submitted Amount)) for all non-rejected FY expenses |
| Outstanding Reimbursements | SUM(COALESCE(Verified Amount, Submitted Amount)) where status ≠ `Reimbursed` AND ≠ `Rejected / Cancelled` |
| Active CRs | COUNT where CR status ∉ {`Distributed`, `Cancelled`, blank} |
| Total Grants | COUNT of all grants |
| Avg Grant Utilization | ROUND(SUM(utilization%) / COUNT(grants)) |

> **V2 Fix**: All amount references use `COALESCE(Verified Amount, Submitted Amount)` — if finance has not yet verified the amount, the submitted amount is used as fallback. This prevents $0 contributions from unreviewed expenses.

### Chart Aggregations

All charts exclude `Rejected / Cancelled`:

| Chart | Grouping | Value |
|---|---|---|
| By Category | Category field | SUM(COALESCE(Verified, Submitted)). Uncategorized → `Uncategorized` |
| By Project | Standardized Project | SUM(COALESCE(Verified, Submitted)). Unassigned → `Unassigned` |
| By Funding Source | Funding Source | SUM(COALESCE(Verified, Submitted)). Unassigned → `Unassigned` |
| Monthly Breakdown | `YYYY-MM` from Purchase Date | SUM(COALESCE(Verified, Submitted)) |
| Top Submitters | Email (e-Transfer) | SUM(COALESCE(Verified, Submitted)). Top 10, descending. See §4.5d. |

### Reimbursement Pipeline

- Every expense grouped by Reimbursement Status
- Per status: `count` and `total` (sum of amounts)
- **Includes all statuses** (even Rejected / Cancelled) for pipeline visibility

### Custom Date Range

- Accepts arbitrary start/end dates
- End date extended to `23:59:59.999` for inclusive filtering
- All aggregations rebuilt for the custom range
- Outstanding in custom range excludes only `Reimbursed`

---

## §5.15 Report Generation

### Report Types

| Type | Filter Logic |
|---|---|
| Monthly | Purchase Date within specified month. Excludes Rejected/Cancelled. |
| Event/Project | Standardized Project exact match. Excludes Rejected/Cancelled. |
| Grant | Funding Source exact match on grant name. Includes grant info (requested, approved, spent, remaining, utilization). Excludes Rejected/Cancelled. |
| Year-End | Purchase Date within current FY. Includes grants, budgets, reconciliation summaries. Excludes Rejected/Cancelled. **V2**: Reads from Expenses directly (no Archive). |
| Term | Purchase Date within arbitrary start–end range. Excludes Rejected/Cancelled. |

### Report Summary Calculations

```
Total Expenses = SUM(COALESCE(Verified Amount, Submitted Amount)) of filtered expenses
Expense Count  = COUNT of filtered expenses
By Category    = SUM grouped by Category
By Status      = COUNT and SUM grouped by Reimbursement Status
```

---

## §5.16 Remaining V1 Logic — Retained Unchanged

The following V1 calculation sections are retained in full without modification:
- §4.16 On-Behalf-Of Detection — **REMOVED** (per user decision; field and detection eliminated)
- §4.17 Archiving Rules — **RESTORED (reliable) — D4** (see §5.17 below for the V2 transactional procedure)
- §4.18 Audit Trail — retained (24-month retention, 15 recent entries in feed)
- §4.19 Batch Reimbursement Mode — retained
- §4.20 All-Submissions Unified View — retained (data merge, de-duplication, sort)
- §4.21 Caching Strategy — superseded by §6.1 (Next.js caching)
- §4.22 Dashboard Alerts Generation — retained with addition of `Action Required` as `warning` severity
- §4.23 Configurable Defaults — retained with modifications noted in §2.12

---

## §5.17 Reliable Archiving (V2 Restored — D4)

Archiving returns to bound the growth of the `Expenses` sheet (no archive = a ledger that grows forever and is re-read on every refresh), but is rebuilt to be safe and never lossy.

### Eligibility

```
Archiving runs ONLY when Enable Archiving = Y, ONLY via Year-End Rollover
(or the "Archive Prior Years" menu item) — never on the routine timer.

A row is eligible IFF:
    Reimbursement Status ∈ {"Reimbursed", "Rejected / Cancelled"}   (fully terminal)
    AND Fiscal Year < (current FY − (KeepLiveFiscalYears − 1))        (older than the live window)
```

So with `KeepLiveFiscalYears = 2`, the current and previous fiscal years always stay in `Expenses`; only fully-settled rows from older years move.

### Transactional, Verified Procedure (lock-protected)

```
withLock(() => {
  eligible = rows matching eligibility
  show dry-run dialog: "Archive N rows from FY 2023–2024 and earlier? [Preview list] [Confirm]"
  on Confirm:
    for each eligible row (processed bottom-to-top to avoid index shift):
      1. Append a full copy to Archive (single appendRow)
      2. Verify the Archive row exists and Row ID + amount match the source
      3. ONLY after verification → delete the source row in Expenses
      4. logToAudit('ARCHIVE', { rowId, fy })
    if any verification fails → STOP, do not delete that source row, log ERROR
  completion panel: "Archived N rows. M skipped (verification failed — left in Expenses)."
})
```

Copy-verify-then-delete guarantees no row is ever deleted before its archived copy is confirmed present — archiving can never lose data, even on partial failure.

### Read Semantics (resolves the original C6 concern)

| Query | Reads |
|---|---|
| Dashboard KPIs / charts (current FY) | `Expenses` only (FY-scoped) |
| Monthly / Event / Grant / Term report within live window | `Expenses` |
| Year-End or Term report for an **archived** FY | `Expenses ∪ Archive`, filtered to the requested FY |
| Any report whose range predates the live window | Union both sheets |

The report generator checks whether the requested period falls before the live-window cutoff; if so, it unions `Archive`. This is why a year-end report run after archiving still includes every record for its fiscal year.

> **FK note**: Archived rows keep their original Funding Source / Project / CR# strings, so historical reports still aggregate correctly. Grants/Budgets for closed years should likewise be marked `Closed`/terminal before their expenses are archived.

---

## §6.1 Data Fetching & Caching Strategy

### Apps Script Web App as JSON API

The Apps Script Web App serves as a JSON API endpoint. It handles different request types via URL parameters:

```
GET {WEB_APP_URL}?action=health
GET {WEB_APP_URL}?action=authCheck&password=...
GET {WEB_APP_URL}?action=status&email=user@example.com
GET {WEB_APP_URL}?action=dashboard&password=...&fy=2526
GET {WEB_APP_URL}?action=report&password=...&type=monthly&month=2026-01
GET {WEB_APP_URL}?action=submissions&password=...&page=1&limit=25&q=search&status=filter
GET {WEB_APP_URL}?action=yearend&password=...
GET {WEB_APP_URL}?action=budgetImpact&password=...&project=StormHacks+2026&amount=350
```

**Password validation**: All endpoints except `health`, `authCheck`, and `status` require a `password` parameter matching the `Dashboard Password` setting. If missing or incorrect, the endpoint returns `{ "error": "unauthorized" }`.

### Health Check Endpoint (V2 New — C4)

The `?action=health` endpoint returns a lightweight JSON object:

```json
{
  "status": "ok",
  "lastRefresh": "2026-06-05T09:00:00Z",
  "sheetId": "abc123...",
  "version": "2.0"
}
```

The Vercel app calls this on initial page load. If the health check fails (timeout, non-200, network error), a persistent banner appears at the top of the dashboard: "⚠️ Unable to connect to data source — displaying cached data. [Retry]". The banner disappears on successful reconnection.

### Next.js Server Component Data Fetching

```javascript
// In a Server Component:
const data = await fetch(process.env.APPS_SCRIPT_WEB_APP_URL + '?action=dashboard', {
  headers: { Authorization: `Bearer ${token}` },
  next: {
    revalidate: 180,        // baseline ISR: at most 3 min stale
    tags: ['dashboard']     // also invalidated on demand by the edit webhook (D1)
  }
});
```

### Refresh Strategy — Aligned Cadence, Quota-Safe, Free (D1, D2, D3)

The earlier design had two misaligned cache layers (a *daily* Dashboard Data sheet behind a *5-min* ISR), so the ISR re-read stale data and bought nothing. V2 aligns everything to a **sub-5-minute, quota-safe** cadence using only free Google + Vercel features:

**Layer 1 — Backend pre-compute (consistent baseline):**
- A time-driven trigger runs `refreshDashboardData()` **every 5 minutes**, recomputing KPIs, chart data, alerts, pipeline, and the configurable lists into the `Dashboard Data` sheet.
- Quota math: 5-min cadence = **288 runs/day**, far under the ~20,000 Apps Script executions/day and well under the 300 read-requests/min Sheets quota (each run is one `batchGet`). Safe even as data and usage grow.

**Layer 2 — Vercel ISR (baseline freshness):**
- `revalidate: 180` (3 min). Aligned to be at least as fresh as the 5-min backend cycle, so the ISR window never out-runs the data behind it.

**Layer 3 — On-edit revalidation webhook (near-real-time for important changes) (D1):**
- Apps Script `onEdit`/menu actions for *significant* events (approval status change, move to expenses, CR status change) call a Next.js route: `POST /api/revalidate` with `{ tag, secret }` where `secret` is a shared Script Property / Vercel env var.
- The route validates the secret and calls `revalidateTag(tag)`. This is the **only** thing that makes the `tags` meaningful — without it, tags are dead weight (the original flaw).
- Debounced in Apps Script (max once per 30s per tag) to avoid hammering the route during bulk edits.

**Net effect**: routine data is never more than ~3–5 minutes stale (Layer 1+2), and high-value changes propagate within seconds (Layer 3). All three layers are free.

> **Client-rendering-first (your guidance)**: Even when the backend is mid-refresh, the Vercel UI renders instantly from the last good ISR snapshot with skeletons streaming in (§6.3). Backend consistency (Layer 1 always running) matters more than shaving the last few seconds of staleness; the webhook is a bonus, not a dependency.

### Tag-Based Revalidation (now actually wired — D1)

| Tag | Scope | Invalidated by |
|---|---|---|
| `dashboard` | KPIs, charts, alerts, activity feed | 3-min ISR **+ edit webhook** on approval/move/CR events |
| `submissions` | All Submissions view | 3-min ISR + edit webhook on form submission / move |
| `reports` | Report data | 3-min ISR |
| `year-end` | FY rollover checklist | 3-min ISR + edit webhook on CR/grant/budget terminal events |
| `status` | Self-service lookup | Not ISR-cached; short per-email cache only (§6.6) |

### Google Sheets API Optimization

The Apps Script Web App uses `batchGet` to minimize API calls. To bound growth (D4), dashboard reads are **fiscal-year-scoped** using the `Fiscal Year` column rather than pulling the entire historical ledger:

```javascript
// FY-scoped read keeps payload bounded as the ledger grows across years
const fy = currentFiscalYearLabel();           // e.g., "FY 2025–2026"
const ranges = [
  'Approval Queue!A:X',
  'Expenses!A:W',          // filtered to current FY in-script via col W
  'CR Tracker!A:P',
  'Mileage Approvals!A:P',
  'Grants!A:T',
  'Budgets!A:K',
  'Settings!A:E',
  'Audit Log!A:I'
];
const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, { ranges });
// Reports needing prior years also read the Archive sheet (§5.17).
```

### Dashboard Data Sheet as Cache

The `Dashboard Data` sheet serves as a pre-computed, write-through cache:
- `refreshDashboardData()` (every 5 min) recomputes all KPIs, chart data, alerts, pipeline, and lists.
- The Web App reads from this sheet for initial page loads (fast, single range read), reducing per-request computation to near-zero.
- It also stores the current configurable lists so the Vercel UI can render dropdluns/filters without a separate Settings round-trip.

---

## §6.2 Next.js Routing & App Structure

```
app/
├── layout.tsx           # Root layout: theme provider, nav, Inter font
├── page.tsx             # Redirects to /status
├── status/
│   └── page.tsx         # Self-service lookup (public)
├── dashboard/
│   ├── layout.tsx       # Dashboard shell with nav tabs
│   └── page.tsx         # KPIs, charts, alerts, pipeline, activity feed
├── reports/
│   └── page.tsx         # Report generator with type selector
├── submissions/
│   └── page.tsx         # All Submissions unified table
└── year-end/
    └── page.tsx         # FY Rollover Checklist
```

### Middleware

```typescript
// middleware.ts — runs on Vercel Edge (free)
export function middleware(request: NextRequest) {
  // Rate limiting for /status to prevent email enumeration
  // CORS headers for API routes (if any)
  // Password gate check:
  //   - /status → no auth required (public)
  //   - /dashboard, /reports, /submissions, /year-end → 
  //     check sessionStorage flag via client-side redirect
  //     (actual password validation happens client-side + 
  //      server-side via Apps Script password param)
}
```

---

## §6.3 Performance Architecture

### Streaming + Suspense

Each dashboard section is wrapped in `<Suspense>`:

```jsx
<Suspense fallback={<KPISkeleton />}>
  <KPICards />
</Suspense>
<Suspense fallback={<ChartSkeleton />}>
  <ExpenseCharts />
</Suspense>
<Suspense fallback={<ActivitySkeleton />}>
  <ActivityFeed />
</Suspense>
```

The page shell renders immediately (~200ms), and data-heavy sections stream in independently.

### Pagination

All Submissions table: 25 rows/page, implemented via URL search params (`?page=2`). The Apps Script endpoint returns paginated data (not all rows).

### Memoization

Chart data transforms (color assignment, status aggregation, monthly grouping) use `useMemo` to prevent recalculation on unrelated state changes.

---

## §6.4 Error Handling & Resilience

### Exponential Backoff for Apps Script Calls

```
delay = min(2^attempt × 100ms + random(0–100ms), 30000ms)
max_retries = 3
Retryable: HTTP 429, 500, 502, 503
Non-retryable: HTTP 400, 401, 403, 404
```

### Per-Section Error Boundaries

Each dashboard section has its own error boundary (`error.tsx`). A failing chart does not unmount KPI cards or the activity feed.

### Stale Data Indicator

A "Last updated X minutes ago" timestamp is displayed next to the auto-refresh indicator. If the fetch fails, the UI shows "Data may be outdated — last successful refresh at {time}" with a manual retry button.

### Receipt File Validation (D5)

Validation uses the **Drive API by file ID**, not an HTTP HEAD on the share URL (a HEAD check produces both false "unavailable" and false "available" because Drive share URLs redirect and respect per-user permissions):

- On form submission, Apps Script extracts and stores the Drive **file ID** alongside the hyperlink.
- The time-driven `validateReceiptLinks()` calls `Drive.Files.get(fileId, {fields:'id,trashed'})`. A `404`/not-found or `trashed:true` marks the receipt as broken and flags it in the Audit Log.
- The Vercel UI receives a `receiptAvailable` boolean (precomputed in Dashboard Data) and renders either the working "📎 View Receipt" link or a muted "📎 Receipt unavailable" state — it does not itself probe Drive.

---

## §6.5 Vercel Free Tier Constraints

| Constraint | Limit | How We Stay Under |
|---|---|---|
| Bandwidth | 100 GB/month | Static assets cached; data is JSON (small payloads) |
| Build minutes | 6,000/month | Single small Next.js app; builds in ~2 minutes |
| Serverless functions | 100 GB-hours/month | Server Components; no long-running functions |
| Edge Functions | 1 MB bundle | Middleware is minimal (rate limiting only) |
| No persistent servers | — | All state in Google Sheets; Next.js is stateless |

---

## §6.6 Rate Limiting & Backend Protection (V2 — S1, S4)

The `/status` page is public and (for UX) shows fresh data, which makes it the prime vector for exhausting the shared Apps Script quota (~20k executions/day). A single bot loop on `/status?...` could take down **both** status lookups and the finance dashboard. Three layers protect the backend:

**1. Edge rate limit (Vercel middleware)**
- `/status` lookups: **5 requests / minute / IP**, burst 10, sliding window. Implemented with a free, dependency-light fixed-window counter in Edge middleware (in-memory per edge region is sufficient for this threat model; no paid KV required).
- On limit exceeded: HTTP 429 with a friendly "Too many lookups — please wait a minute."

**2. Per-email short cache**
- Each `/status` result is cached for **60 seconds** keyed by normalized email. Repeated lookups of the same email within the window are served from cache and do **not** hit Apps Script. This collapses refresh-spam and accidental double-submits into a single backend call.

**3. Apps Script circuit breaker**
- Apps Script tracks a rolling count of `status` executions in `CacheService`. If it exceeds a safe hourly budget (e.g., **800/hour**, configurable), further `status` calls return `{ "error": "rate_limited" }` and the UI shows "Status lookup is temporarily busy — please try again shortly." Dashboard endpoints (token-gated) are unaffected, so finance is never locked out by public traffic.

**`authCheck` protection**: limited to **5 attempts / minute / IP** (§1.6) to prevent password brute-forcing.

> Concrete numbers are specified (not just "rate limiting exists") so this gets built correctly. All mechanisms are free and require no external service.

| Setting | Default | Section |
|---|---|---|
| Dashboard password | `Spendy-Otter` | §1.6 |
| Mileage rate | `$0.22/km` | §5.1 |
| Auto-approve enabled | `N` (disabled) | §5.5 |
| Auto-approve threshold | `$0` (disabled) | §5.5 |
| Enable duplicate detection | `Y` | §5.6 |
| Duplicate window | `7 days` | §5.6 |
| Receipt age threshold | `2 days` | §5.7 |
| Budget warning % | `75%` | §5.8 |
| Budget critical % | `90%` | §5.8 |
| Budget over-limit % | `100%` | §5.8 |
| Include committed in budget | configurable | §5.8 |
| Allow over-budget submissions | `Y` (always) | §5.8 |
| Grant warning % | `80%` | §5.9 |
| Grant critical % | `95%` | §5.9 |
| Grant follow-up days | `14 days` | §5.10 |
| Grant appeal window | `30 days` | §5.10 |
| CR follow-up weeks | `3 weeks` | §5.11 |
| CR escalation weeks | `6 weeks` | §5.11 |
| Payment follow-up weeks | `2 weeks` | §5.12 |
| Payment escalation weeks | `4 weeks` | §5.12 |
| Large expense threshold | `$500` | §5.12 |
| Audit retention months | `24 months` | §5.16 |
| Enable archiving | `N` (off) | §5.17 |
| Keep live fiscal years | `2` (current + previous) | §5.17 |
| Auto-approve enabled | `N` (off) | §5.5 |
| Max expenses per CR | `0` (unlimited) | §5.11 |
| Fiscal year start | `May 1` | §5.4 |
| Backend pre-compute cadence | `5 minutes` (288 runs/day, quota-safe) | §6.1 |
| Vercel ISR revalidate | `180 seconds` (3 min) | §6.1 |
| On-edit webhook debounce | `30 seconds` per tag | §6.1 |
| `/status` per-email cache | `60 seconds` | §6.6 |
| `/status` edge rate limit | `5 req/min/IP` (burst 10) | §6.6 |
| Apps Script `status` circuit breaker | `800/hour` | §6.6 |
| `authCheck` rate limit | `5 attempts/min/IP` | §1.6 |
| Dashboard token expiry | `7 days` | §1.6 |
| Activity feed count | `15` entries | §5.16 |
| Scheduled check frequency | `Daily` (9 AM) | §3.9 |
| Self-service enabled | configurable | §4.4 |
| Show denied grants | `true` | §5.10 |
| Batch reimbursement mode | `false` | §5.16 |

---

# PART 8: V2 CHANGE LOG — SUMMARY

## Additions (V2.0 — Architecture & State Machine)
1. **Concurrency via LockService** — all status-mutating handlers serialize; `Last Modified` timestamp for staleness/audit (replaced the non-functional "Version" optimistic-lock idea)
2. **Atomic mileage move** — `LockService` prevents double-insertion race condition
3. **CR Cancellation** — `Cancelled` status with clean expense revert
4. **CR Action Required** — New status for when club must provide info to SFSS
5. **Expense-CR unlinking** — Finance can manually remove an expense from a CR
6. **Undo Move to Expenses** — Director-only revert of incorrectly moved AQ items
7. **Approval clearing recalculation** — Blanking an approval field triggers fresh status computation
8. **Sequential mode enforcement** — Data validation blocks Director approval before Coordinator
9. **Budget Impact Preview** — Modal showing budget effect before approving expenses
10. **FY Rollover Checklist** — Read-only year-end readiness dashboard
11. **Reconciliation actual amounts** — `Actual Amount Received`, `Supplementary Source`, `Supplementary Amount` fields
12. **Payment Distribution auto-generation** — Time-driven function creates Reconciliation §2 rows
13. **Receipt URL validation** — Time-driven check for broken Drive links
14. **File operation error handling** — All file moves wrapped in try-catch with audit logging
15. **Grant Appeal Amount Approved** — Separate field preserving original approval for reference
16. **COALESCE pattern** — All amount references use `COALESCE(Verified, Submitted)` for robustness

## Additions (V2.1 — UX, Integrity & Formatting)
17. **Rejection reason on self-service** (A1) — Members can see why their expense was rejected
18. **Dynamic progress bar** (A2) — 4-step bar for direct payments, 8-step for CR path
19. **Self-service error states** (A3) — Distinct "no results" vs "service unavailable" vs "disabled"
20. **Self-service deep links** (A4) — Shareable `/status?id=...` URLs (email re-entered, not in URL — see V2.2)
21. **Submissions search & filter** (B1) — Search by name/vendor/ID + status/type dropdown filters
22. **Top Submitters chart** (B2) — Horizontal bar chart of top 10 emails by expense total
23. **Dashboard password gate** (B2) — All non-status pages require shared password (`Spendy-Otter` default, configurable)
24. **Alert count cap** (B3) — Top 5 alerts shown, expandable "Show all X" link
25. **Smart auto-refresh** (B4) — Background check + "new data available" toast instead of silent swap
26. **Empty state designs** (B5) — Explicit zero-data renders for all dashboard sections
27. **Expense Type column** (C1) — `Receipt` / `Mileage` field replaces fragile vendor-name matching
28. **Fiscal Year column** (C2) — Computed FY label on Expenses for simplified filtering
29. **Row deletion cascade** (C3) — Confirmation dialog + CR recalculation when linked expense deleted
30. **Health check endpoint** (C4) — `?action=health` for Vercel connection monitoring
31. **New status conditional formatting** (D1) — Spreadsheet colors for `Action Required` and `Cancelled`
32. **Fully Approved visual distinction** (D2) — Bold left border + pulse animation for actionable AQ rows
33. **Batch Move to Expenses** (E1) — Process all Fully Approved items in one action with aggregate budget preview
34. **Mileage rejection reason exposure** (E2) — Review Notes shown on self-service for rejected mileage
35. **Required field validation before move** (E3) — Block move if Project or Category is blank
36. **Settings list rename cascade** (E4) — Cascading rename dialog when list items are edited
37. **CR funding validation** (E5) — Block CR submission when FS allocation doesn't match total

## Additions / Hardening (V2.2 — Stress-Test Resolutions)
**Functionality & Logic**
- **F1/F2** `LockService` on every status-mutating handler; `Version` columns reworked into honest `Last Modified` timestamps (concurrency is serialized, not versioned)
- **F3** Range-aware `onEdit` so bulk copy-paste (a core migration requirement) recalculates every pasted row
- **F4** Budget Impact Preview recomputes inside the lock at confirm-time, closing the TOCTOU gap
- **F5** Mileage move is transactional (build-in-memory → single `appendRow` → verify), eliminating the partial-write duplicate window
- **F6** Every computed column declares Formula vs Script + refresh trigger; `COALESCE` shorthand mapped to real `IF()` syntax where formula-based
- **F7** Fiscal Year recomputes on Purchase Date edit, not just daily
- **F8** Undo Move restores the AQ row by Row ID match, never by stale row index
- **F9** Mileage rate has a single source of truth (`MileageStandardRate` setting)
- **F10** Payment Distribution auto-gen is idempotent (exact-ID set match + lock)
- **F11** Cancelled CRs excluded from Reconciliation entirely

**Intuitive UX**
- **X1** Batch move: persistent skip-results panel + in-sheet highlighting; non-contiguous row selection via `getActiveRangeList()`
- **X2** Self-service email matching normalized (`trim().toLowerCase()`)
- **X3** Soft cross-field guards catch contradictory manual status edits
- **X4** Live "ready to move" count in the menu label + onboarding nudge
- **X5** Password remembered via `localStorage` with configurable expiry (no per-tab re-entry)
- **X6** `Action Required` rendered explicitly at step 5 ("Info Requested") on the CR progress bar

**Design & Architecture**
- **D1** Apps Script → Next.js `/api/revalidate` webhook makes tag-based revalidation actually fire (was dead weight)
- **D2/D3** Aligned, quota-safe refresh: 5-min backend pre-compute + 3-min ISR + on-edit webhook (≤~5 min routine staleness, seconds for key changes); client-render-first; full + free
- **D4** Reliable archive restored — copy-verify-then-delete, prior-FY-only, reports union Archive
- **D5** Receipt validation uses Drive API by file ID (not fragile HTTP HEAD)

**Security & Access**
- **S1** `/status` DoS protection: edge rate limit + 60s per-email cache + Apps Script circuit breaker
- **S2** Token-based auth (POST password → signed short-lived token; no password in URLs; hashed compare; brute-force limit)
- **S3** Deep links omit email; ID-ownership re-checked after email entry
- **S4** Concrete rate-limit numbers specified; enumeration tradeoff documented
- **S5/S6** Settings deletion cascade (reassign / keep-as-orphan / cancel) + data-validation auto-extended to legacy values
- **S7** Audit `User` capture fallback chain; never logs blank

## Removals
1. **On-Behalf-Of** — Removed; submitted email is always the reimbursement recipient
2. **Auto-Approved status string** — Removed; auto-approval (when enabled) uses real approver names
3. **Forgeable base64 share tokens** — Removed; self-service uses direct email entry
4. **Email notifications** — Not in scope
5. **"Version" optimistic-lock column** — Replaced by `Last Modified` + `LockService` (V2.2 F1/F2)

> **Note**: The Archive sheet, briefly removed in V2.0, is **restored** in V2.2 as a reliable, opt-in, transactional system (D4).

## Modifications
1. **Auto-approval default** — Changed from threshold-based to disabled-by-default with master toggle
2. **Budget Planning→Active trigger** — Now requires `spent > 0` (committed alone insufficient)
3. **Budget formulas** — Two explicit modes based on Include Committed toggle
4. **Duplicate detection** — Advisory only, never auto-rejects
5. **Over-budget submissions** — Always allowed (setting locked to Y)
6. **Rejection interlock** — Clear precedence rules between col U text and col O/P dropdowns
7. **KPI amount fallback** — All KPIs use COALESCE(Verified, Submitted) instead of Verified-only

---

*End of V2 System Specification Document*
