# SFU Surge Finance Dashboard V2.2 — Implementation Plan

> Task tracker for the full build. Work through phases **in strict order**.
> Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.
> Each task is scoped to ≤ ~200 lines of output. At the end of every task: mark `[x]`,
> update the **Current Session** section at the bottom, and (if git is initialized) commit.

---

## File Layout (target)

```
/sheets/                 Apps Script .gs files (one per logical domain)
  bootstrap.gs           PHASE 1 — programmatic schema builder (rebuild from scratch)
  Config.gs              constants, sheet-name keys, getSettingValue, cfg object
  Utils.gs               parseAmount, formatCAD, fiscal-year, date, ID generation
  Lock.gs                withLock(fn) LockService wrapper
  Audit.gs               logToAudit + S7 user-capture fallback chain
  Triggers.gs            onOpen, onFormSubmit, onEdit, onChange dispatchers
  ApprovalQueue.gs       approval recalc, rejection interlock, sequential gate, auto-approve
  Mileage.gs             transactional mileage move (§2.5 / F5)
  Expenses.gs            move-to-expenses, status transitions, file moves, unlink, undo
  CRTracker.gs           CR create/cancel/cascade/recalc, funding validation
  Grants.gs              grant utilization recalc
  Budgets.gs             budget spending recalc + status auto-rules
  Reconciliation.gs      §1 recompute + §2 payment-distribution auto-gen (F10/F11)
  Settings.gs            list rename/delete cascade (E4/S5/S6)
  TimeDriven.gs          scheduled jobs + trigger installer
  Menu.gs                custom menu, menu actions, HtmlService modals
  Auth.gs                HMAC token sign/verify, authCheck, password hash (S2)
  RateLimit.gs           status circuit breaker + authCheck brute-force limit (S1/S4)
  WebApp.gs              doGet/doPost JSON API router (all ?action= endpoints)
  Dashboard.gs           refreshDashboardData + KPI/chart/pipeline/activity aggregations
  *.html                 modal/sidebar templates (budget impact, batch move, year-end)
/src/app/                Next.js App Router routes
/src/components/         shared UI components
/src/lib/                data fetching, backoff, cache, auth-token, types
PLAN.md                  this tracker
.env.example             all required environment variables
```

---

## PHASE 1 — Google Sheets Bootstrap

Goal: a single commented GAS helper script `sheets/bootstrap.gs` that programmatically
creates the full schema (all sheets, headers, data validations, conditional formatting,
named ranges) so the workbook can be rebuilt from scratch.

- [x] **1.1 Bootstrap framework** — header comment, `buildAll()` entry point, sheet-name
  constants, color constants (§2.4/§2.5 header groups), `getOrCreateSheet_()`,
  `setHeaders_()`, `setHeaderColors_()`, `freezeAndHide_()` helpers.
- [x] **1.2 Settings sheet builder** — key-value section (cols A–E) seeded with all V2
  settings + defaults (§2.12), the full §6.6 settings table defaults, plus `Dashboard
  Password=Spendy-Otter`, `MileageStandardRate=0.22`. Toggle/dropdown validations.
- [x] **1.3 Settings configurable lists + named ranges** — all `LIST:` blocks (§2.12),
  default values, and `list_{Name}` named ranges (ProjectNames, ExpenseCategories,
  FundingSources, PaymentMethods, GrantTypes, CR/Reimbursement/Approval/Grant/Budget
  statuses, Coordinator/Director names, etc.).
- [x] **1.4 Approval Queue sheet** — 24 cols (§2.4) with exact headers, color-coded header
  groups (A–L blue / M–N purple / O–W green / X gray), dropdown validations (O,P,R,S),
  duplicate-flag formula (col M), hidden cols W,X, frozen header.
  _(Note: M/N/Q script-populated per row; dropdowns allowInvalid=true for paste-tolerance.)_
- [x] **1.5 Mileage Approvals sheet** — 16 cols (§2.5), header groups (A–K blue / L–O teal /
  P gray), Status dropdown (Pending/Approved/Rejected), hidden col P, frozen header.
- [x] **1.6 Expenses sheet** — 23 cols (§2.6), dropdowns (E,J,M,O,Q,V), Status Age formula
  (`=TODAY()-B`, script-injected per row), Expense Type + Fiscal Year cols, frozen header.
- [x] **1.7 CR Tracker sheet** — fixed cols A–P (§2.7), dynamic `FS: {source}` cols from
  FundingSources list, `Funding Total Check` formula col, dropdowns (F,G,H,I), hidden
  col P, frozen header.
- [x] **1.8 Grants sheet** — 20 cols (§2.8), dropdowns (C,F,R), utilization placeholder.
- [x] **1.9 Budgets sheet** — 11 cols (§2.9), dropdowns (A,H,I).
- [x] **1.10 Reconciliation sheet** — two-section layout (§2.10): §1 title row 1, headers
  row 2, data row 3+; §2 title row 20, headers row 21, data row 22+. Discrepancy/Total
  Available formulas (live, script-injected per generated row).
- [x] **1.11 Audit Log sheet** — 9 cols (§2.11), warning-only protection.
- [x] **1.12 Dashboard Data + Archive sheets** — Dashboard Data cache layout (§6.1 keys),
  Archive sheet mirroring Expenses schema exactly (§5.17). Also added Form Responses 1/2
  header stubs (§2.2/§2.3) so the schema is complete before Forms are linked.
- [x] **1.13 Conditional formatting rules** — all status row backgrounds (§4.2 V2 additions:
  Action Required `#FFE0B2`, Cancelled `#E0E0E0`, Fully Approved `#D4EDDA` + green accent
  lane on col A), budget/grant terminal colors, duplicate-row `#E1BEE7`. Wired into
  `buildAll()`; `verifySchema_()` checks all sheets + `list_` named ranges.
  _(CF cannot set borders, so D2's "4px left accent" is a solid col-A fill.)_

**✅ PHASE 1 COMPLETE** — `sheets/bootstrap.gs` (34 functions) builds the full 13-sheet
schema from scratch via `buildAll()`.

---

## PHASE 2 — Apps Script Core Engine

- [x] **2.1 Config.gs** — `SHEETS` name constants, `COLS` index maps per sheet,
  `getSettingValue(key)` (per-execution memo), `getCfg()` typed config object,
  `getListValues(name)`, fiscal-year settings.
- [x] **2.2 Utils.gs** — `parseAmount`, `formatCAD`, `roundMoney`, `coalesceAmount`,
  `generateRowId`, `currentFiscalYearLabel`/`Code`, `fiscalYearForDate` (§5.4 boundary
  configurable May 1), `formatDate`/`formatAuditTimestamp`/`monthKey`, `daysBetween`/
  `daysSince`/`weeksSince`, `normalizeEmail` (X2), `buildHyperlink`, `extractDriveFileId` (D5).
- [x] **2.3 Lock.gs** — `withLock(fn)` (10s tryLock, toast on busy, release in finally,
  re-entrancy guard, §3.3g/F1-F2), `touchLastModified(sheet,row,col)`, `safeToast_`,
  `safeConfirm_` (UI-safe in headless contexts).
- [x] **2.4 Audit.gs** — `logToAudit(action, opts)` with S7 user fallback chain
  (activeUser → effectiveUser → form submitter → `unknown@edit`), never blank;
  timestamp format `MMM D, YYYY, h:mm AM/PM`; `logError`/`logFileError` wrappers;
  logging failures never break the audited operation.
- [x] **2.5 Triggers.gs dispatchers** — `onOpen` (delegates to Menu), `onFormSubmit(e)`
  router (receipt vs mileage), `onEdit(e)` range-aware dispatcher (F3) routing to
  per-sheet handlers, `onChange(e)` for Expenses row-deletion (C3). All mutating paths
  wrapped in `withLock`. Helpers: `rangeInfo_`, `bigPasteToast_`, `eachDataRow_`.
- [x] **2.6 onFormSubmit — receipt** (`Forms.gs` + shared `Files.gs`) — append AQ row,
  generate Row ID, set Pending, compute Receipt Age, file rename/move with try-catch
  (§3.3d/§3.3f), Drive file ID parsed from URL (D5), auto-approve hook (§3.3e off by
  default), audit FORM_SUBMISSION. _(Added `Files.gs`: folder org per §2.12,
  status-folder mover for §3.4e, used by 2.12/2.13 too.)_
- [x] **2.7 onFormSubmit — mileage** — append Mileage Approvals row, rate selection
  (F9 `MileageStandardRate`), total payout, Pending, audit.
- [x] **2.8 ApprovalQueue.gs — recalc core** — `computeApprovalStatus_` (pure mode logic
  Independent/Sequential/Both Required, §3.3a), `recalculateApprovalStatus(row)` with
  rejection interlock precedence (§3.3d), clearing recalc (§3.3c), terminal-skip,
  audit + Last Modified + revalidate notify.
- [x] **2.9 ApprovalQueue.gs — sequential gate + onEdit handler** — `handleApprovalQueueEdit_`
  (range-aware F3), Sequential col-P gate (clear + toast, §3.3a), col Q treated as
  authoritative-computed, `refreshReceiptAge_` on Purchase Date edit. _(Auto-approve runs
  at form-submit per 2.6, not here, per §3.3e.)_
- [x] **2.10 Expenses.gs — moveRowToExpenses (single)** — required-field validation
  (Project+Category, E3/§4.5i), COALESCE verified/submitted (col G), Expense Type=Receipt,
  Fiscal Year, preserved Row ID, Status Age live formula, write-verify, AQ→Moved to
  Expenses (CF auto-grays), Source Row, audit, revalidate. Lock-wrapped (re-entrant).
- [x] **2.11 Expenses.gs — undo move + unlink** — `undoMoveToExpenses` (Director-only,
  Row-ID match F8, delete Expenses row, restore AQ→Fully Approved, §3.4d),
  `unlinkExpenseFromCR` (revert to Approved, recalc CR, guard cheque-received, §3.4c).
  _(Added `Perms.gs`: `isDirector_`/`isCoordinator_`/`requireDirector_` §1.5;
  `findRowByValue_` added to Config.gs for F8 Row-ID/CR# lookups.)_
- [x] **2.12 Expenses.gs — status transitions + file moves** — `handleExpensesEdit_`
  (range-aware), `onExpenseStatusEdit_` (§3.4e: payment-date auto-fill, follow-up flag,
  file→folder w/ error handling, X3 soft guards), `normalizeExpenseRow_` (legacy paste:
  Type/FY F7/Status Age), CR-unlink detection, `refreshExpenseFollowUpFlag_`,
  `handleExpensesRowChange_` (C3 backstop), audit STATUS_CHANGE.
- [x] **2.13 Mileage.gs — transactional move** — `moveMileageToExpenses` exact §2.5/F5
  ordering (re-read Processed → build in memory → single write → verify → set Processed
  → finalize in try-catch, never revert), `handleMileageEdit_` (col L → Approved triggers
  move; Reviewer/Review Date auto-fill; Rejected audit, §3.5).
- [x] **2.14 CRTracker.gs — create + recalc** — `createChequeRequisition` (eligible
  Approved+no-CR, max-per-CR, CR number sequencing §2.1, total/desc, FS cols=0, set
  expense CR# + CR Draft), `recalcCR(crNumber)` (#/Total/Description/Funding Total Check,
  C3 empty-CR note). Helpers: `getCRLayout_`, `buildFundingCheckFormula_`, `nextCRNumber_`,
  `crDescription_`; `columnToLetter_`/`padNum_` added to Utils.
- [x] **2.15 CRTracker.gs — cascade + cancel + funding gate** — `handleCRTrackerEdit_`,
  `handleCRStatusChange_`, `cascadeCRStatus` (§3.4a map → linked expenses, payment-date
  auto-set, follow-up refresh), `cancelCR`/`cancelCRInternal_` (Director-only, revert
  expenses to Approved + clear CR#, §3.6), funding-match hard block on Ready/Submitted
  (E5/§4.5k), X3 zero-expense soft guard.
- [x] **2.16 Grants.gs** — `recalculateGrantUtilization()`: effective approved =
  COALESCE(Appeal Approved, Approved), `_spendByFundingSource_` cross-sheet sum (excl
  Rejected/Cancelled), Remaining=max(0,…), Utilization %, `buildGrantBar_` 20-char bar,
  follow-up flags (§5.9/§5.10), batched writes. `repeatChar_` added to Utils.
- [x] **2.17 Budgets.gs** — `recalculateBudgetSpending()`: `_spentByProject_` (excl
  Rejected/Cancelled), `_committedByProject_` (AQ pending, COALESCE), two-mode
  Remaining/Utilization (§5.8 toggle), `buildBudgetBar_` (█▓░), status auto-rules
  (Planning→Active only if spent>0, →Over Budget at over-limit%, Closed never overridden),
  batched writes + audit on status change.
- [x] **2.18 Reconciliation.gs** — `recalculateReconciliation()` §1 rebuild (exclude
  Cancelled F11, preserve manual cols, live Discrepancy/Total-Available formulas +
  script Coverage/Distributed flags §5.13, clear stale rows), `generatePaymentDistribution()`
  §2 idempotent auto-gen by Row-ID set + lock (F10), `computeReconciliationSummary_` KPIs.
- [x] **2.19 Settings.gs — cascade** — `handleSettingsEdit_` rename (E4) + delete (S5)
  detection via e.oldValue/e.value on `LIST:` value cells, `_identifyListAtRow_`,
  reference scan/`_cascadeRename_` across AQ/Expenses/Budgets/Grants (+ CR FS header
  rename), reassign / keep-orphan / cancel dialogs (headless-safe), audit
  SETTING_RENAME_CASCADE/SETTING_DELETE. _(S6 satisfied structurally by allowInvalid:true.)_
- [x] **2.20 TimeDriven.gs** — `installTriggers()` (installable form-submit/onSheetEdit/
  change + 5-min `scheduledRecalc` + daily `dailyScheduledChecks`), `refreshExpenseFollowUpFlags`,
  `refreshCRFollowUpFlags`+`refreshCRFollowUpFlag_` (§5.11), `cleanOldAuditEntries`,
  `validateReceiptLinks` (Drive API by file ID, D5), `refreshAllReceiptAges_`,
  `refreshAllExpenseFiscalYears_` (F7 daily). _(Renamed Triggers `onEdit`→`onSheetEdit`
  so the installable trigger is UrlFetch-capable and never double-fires.)_
- [x] **2.21 Menu.gs — menu + single actions** — `buildSurgeMenu_` "⚡ Surge Finance" with
  live "(N ready)" count + X4 onboarding nudge, `menuMoveActiveRow`/`menuUndoMove`/
  `menuCreateCR`/`menuCancelCR`/`menuRefreshDashboard`/`menuYearEndRollover`/
  `menuArchivePriorYears`, `collectSelectedRows_` (non-contiguous X1). _(Added `Archive.gs`:
  `computeYearEndChecklist_` §4.5b + transactional `archivePriorYears_` §5.17/D4.)_
- [x] **2.22 Menu.gs — batch move + safe delete** — `menuMoveAllFullyApproved`,
  `menuMoveSelected`, `batchMove_` (pre-flight skip detection for missing Project/Category,
  per-project aggregate confirm, transactional per-row move), `_highlightSkippedRow_`
  (#FFF3CD + Internal Notes marker X1), `_showBatchResultsPanel_` (persistent HtmlService
  sidebar X1), `menuDeleteExpense` (C3 pre-delete confirmation w/ CR impact + recalc).
- [x] **2.23 Budget Impact modal** (`BudgetModal.gs`) — `showBudgetImpactForMove_`
  HtmlService modal (§4.5a, current vs after), `confirmBudgetMove` (PUBLIC) with F4
  confirm-time recompute-in-lock + "budget changed" re-confirm, `computeBudgetImpact_`
  (shared with WebApp 3.7). Batch per-project aggregate handled in `batchMove_` (2.22).

**✅ PHASE 2 COMPLETE** — Core engine: 18 `.gs` files. Triggers, full state machine
(AQ/Expenses/Mileage/CR/Grants/Budgets/Reconciliation), LockService, audit, time-driven
jobs, menu + batch + modals, settings cascade, archiving.

---

## PHASE 3 — Apps Script Web App (JSON API)

- [x] **3.1 Auth.gs** — `getSecret`/`getRevalidateSecret` (auto-gen Script Properties),
  `hashPassword`/`verifyPassword` (salted SHA-256 vs Dashboard Password setting, no
  plaintext logging), `signToken`/`verifyToken` (HMAC-SHA256 base64url, `{exp}` 7-day,
  Bearer-aware, S2/§1.6).
- [x] **3.2 RateLimit.gs** — `checkStatusCircuitBreaker` (rolling hourly count in
  CacheService, 800/hr S1), `checkAuthRateLimit(ip)` (5/min/IP §1.6), `_rateHit_` counter.
- [x] **3.3 WebApp.gs — router** — `doGet`/`doPost`→`_route_` dispatch on `action`,
  `jsonOut_` (ContentService JSON), `requireAuth_` (token param OR password), `_guard_`,
  `getClientIp_`, `postBody_`. _(Token passed as param, not header — Apps Script can't read
  request headers; Next.js forwards server-side so S2 still holds. No CORS needed:
  server-side fetch.)_
- [x] **3.4 WebAppEndpoints.gs — health + authCheck + status** — `handleHealth_` (C4 +
  lastRefresh from cache), `handleAuthCheck_` (rate-limited, verify→signToken, no
  reflection), `handleStatus_` (disabled flag, circuit breaker, normalized X2,
  `_buildStatusRecords_` union AQ+Expenses+Mileage with de-dup, §4.4 field exposure +
  conditional rejection/review notes, `_hyperlinkUrl_` extraction, deep-link `id`
  ownership S3, 60s per-email cache §6.6, newest-first sort).
- [x] **3.5 Dashboard.gs — aggregations** — `dashboardPayload_(fyLabel)` (FY-scoped via
  `_expRowFy_`), `_computeKPIs_` (§5.14 COALESCE), `_computeCharts_` (Category/Project/
  Funding/Monthly + Top Submitters masked `_maskEmail_` §4.5d), `_computePipeline_` (all
  statuses), `_computeActivity_` (15, §5.16), `_computeAlerts_` (severity-sorted §4.22 +
  Action Required + X4 ready-to-move), `_buildListsPayload_`. Pure compute, no writes.
- [x] **3.6 Dashboard.gs — refreshDashboardData** — `refreshDashboardData()` writes all
  payload keys (incl yearEndChecklist) JSON to the Dashboard Data cache (§6.1 Layer 1) +
  lastRefresh/version, `getDashboardCache_(key)` reader (JSON-parse), `notifyRevalidate_(tag)`
  (30s/tag debounce via CacheService, POST `{tag,secret}` to `cfg.revalidateWebhookUrl`,
  fault-tolerant, D1). Health endpoint repointed to `getDashboardCache_`.
- [x] **3.7 WebAppReports.gs — dashboard/submissions/report/yearend/budgetImpact** —
  `handleDashboard_` (cache read w/ live fallback, `resolveFyLabel_`), `handleSubmissions_`
  (`_buildAllSubmissions_` union + q/status/type filters + pagination §4.5c),
  `handleReport_` (5 types §5.15, `_reportSourceRows_` unions Archive for pre-live-window
  §5.17, summary by category/status, grant info), `handleYearEnd_`, `handleBudgetImpact_`.

**✅ PHASE 3 COMPLETE** — Web App JSON API: Auth, RateLimit, router, all `?action=`
endpoints, dashboard aggregations + write-through cache + D1 revalidate webhook.

---

## PHASE 4 — Next.js App (App Router)

- [x] **4.1 Project scaffold** — `package.json` (next 14.2/react 18/chart.js 4.4.1/tailwind),
  `next.config.mjs`, `tsconfig.json` (@/* paths, excludes sheets/), `tailwind.config.ts`
  (colors→§4.1 CSS vars), `postcss.config.mjs`, `.gitignore`, `src/app/layout.tsx` (Inter
  font, no-flash theme script, ThemeProvider+NavBar shell), minimal `globals.css`.
- [x] **4.2 globals.css design system** — exact §4.1a/b CSS custom properties (dark default
  + `[data-theme="light"]`), shadows/radii/transitions (§4.1c–e), base resets/typography,
  reusable classes (`surge-card`, `badge-*` incl `badge-action`, `btn-*`, `input`,
  `skeleton`, `pulse-once` D2, `dot-live` §4.5f, spinner) + animations/print styles.
- [x] **4.3 lib — data fetching + backoff** — `appsScript.ts`: `fetchAppsScript<T>`
  (backoff §6.4 min(2^n·100+jitter,30000), 3 retries, retryable 429/500/502/503; URL
  builder with `action`+`token`+params; ISR `{revalidate:180, tags}` §6.1; POST no-store),
  `AppsScriptError`, `postAuthCheck(password)`. Logical `{error}` envelopes pass through.
- [x] **4.4 lib — types + utils** — `types.ts` (all payload interfaces), `format.ts`
  (`formatCAD`, `statusBadgeClass` §4.2, `relativeTime`, `getProgress` §4.4 CR 8-step /
  direct 4-step / Action Required step 5 X6 + step maps), `api.ts` (typed getters:
  getHealth/getDashboard/getSubmissions/getReport/getYearEnd/getBudgetImpact/getStatus
  with correct ISR tags/revalidate).
- [x] **4.5 Theme + ThemeToggle + NavBar** — `lib/auth.ts` (client token store localStorage
  `surge-auth`+expiry X5: get/set/clear/isAuthed), `ThemeProvider` ('use client', context,
  `surge-theme` persistence §4.1g), `ThemeToggle`, `NavBar` (tabs + active state via
  usePathname + theme toggle, glass styling). Resolves layout forward refs.
- [x] **4.6 Middleware** — `src/middleware.ts`: edge rate limit for `/status` lookups
  (requests w/ ?email=/?id=, fixed-window burst 10/min/IP in-memory per region, S1/§6.6,
  429 + Retry-After), `/`→`/status` redirect, matcher `['/','/status']`. Password gate is
  client-side (documented).
- [x] **4.7 Password gate** — `/api/auth` route (POST password→`postAuthCheck`→sets
  `surge-auth` cookie Max-Age=expiry; DELETE=sign out), `serverAuth.getServerToken()`
  (Server Components read cookie), `AuthGate.tsx` (full-page prompt §1.6, design-styled,
  router.refresh on success, 429/error states). _(Token in cookie not localStorage:
  required for Server-Component/ISR reads; same 7-day cross-tab persistence as X5.)_
- [x] **4.8 /status — page + lookup form** — `status/page.tsx` (Server Component, reads
  searchParams email/id → `getStatus`, all §4.4 states: intro / disabled / rate_limited /
  unavailable+retry / no-results / results), `StatusLookupForm` (normalized email →
  `/status?email=`, preserves id), `ui/Skeleton`, `ui/EmptyState`.
- [x] **4.9 /status — record cards + progress bar** — `ui/Badge` (StatusBadge w/ D2 pulse,
  TypeBadge §3.10), `ProgressBar` (4/8-step §4.4, Action Required step + Info Requested X6,
  rejected state), `StatusRecordCard` (amount/event/desc, mileage distance/rate, conditional
  rejection reason + review notes, receipt link, S3 copy-link), `StatusResults` (count +
  deep-link highlight/scroll). `/status` now fully renders.
- [x] **4.10 /dashboard — shell + KPI cards** — `dashboard/page.tsx` (AuthGate-guarded
  Server Component → `getDashboard`, unauthorized→AuthGate, header w/ FY + `relativeTime`
  + live dot), `HealthBanner` (C4 via `/api/health` route), `KpiCard` (animated counter +
  §4.5g empty state) + `KPICards` (4 cards), `SectionBoundary` (§6.4 per-section), route
  `error.tsx` + `loading.tsx` skeletons (§6.3).
- [x] **4.11 /dashboard — charts** — `ChartCard` (§4.5g empty state), `ExpenseCharts`
  ('use client', chart.js registered, 5 charts: 3 doughnuts + monthly bar + Top Submitters
  horizontal bar §4.5d w/ count+outstanding tooltip), 15-colour palette, theme-aware
  axis/legend colours (recompute on theme), `useMemo` transforms. Wired into dashboard page.
- [x] **4.12 /dashboard — alerts + pipeline + activity** — `AlertsSection` (cap 5, count
  badge, "Show all X alerts ▼" expand §4.5e, severity icons/colors, empty ✅),
  `PipelineSection` (every status count+total, zeros shown), `ActivityFeed` (15 entries,
  action dot colors §3.7, empty state). Wired into dashboard page in SectionBoundaries.
- [x] **4.13 /dashboard — smart auto-refresh** — `lib/checksum.ts` (`dashboardChecksum`),
  `/api/dashboard-checksum` route (cookie-token → signature), `AutoRefresh` ('use client',
  300s poll, compares to initial checksum, non-blocking bottom toast "📊 Dashboard data
  updated — [Refresh now]"→`router.refresh()`, B4/§4.5f). Live dot already in header.
  Dashboard page body wrapped in `AutoRefresh`.
- [x] **4.14 /submissions** — `submissions/page.tsx` (AuthGate-guarded, `getSubmissions`
  w/ page/q/status/type, live status options via cached `getDashboard`), `SubmissionsToolbar`
  (debounced 300ms search + status/type selects, URL-param driven §4.5c, resets page),
  `SubmissionsTable` (D2 Fully Approved pulse, TypeBadge), `Pagination` (?page=),
  empty + filtered-empty (Clear filters) states, `error.tsx`.
- [x] **4.15 /reports** — `reports/page.tsx` (AuthGate-guarded; type+params→`getReport`;
  option lists via cached `getDashboard`), `ReportControls` (5 types + per-type inputs,
  URL-driven Generate §5.15), `ReportViewer` (summary, by-category bars, by-status table,
  grant info block), `PrintButton` (window.print, print CSS in globals), `error.tsx`.
- [x] **4.16 /year-end** — `year-end/page.tsx` (AuthGate-guarded → `getYearEnd`), 7
  checklist items ✅/⚠️ + count + info (archiving-disabled informational), overall readiness
  banner, note that rollover runs in the Sheet, `error.tsx`.
- [x] **4.17 /api/revalidate** — POST validates `REVALIDATE_SECRET`, `revalidateTag(tag)`
  (D1), 400/401 envelopes.
- [x] **4.18 Budget Impact Preview (server-rendered)** — `BudgetImpactView` (read-only
  current vs after, no-budget message, §4.5a), `/budget-impact` page (AuthGate-guarded →
  `getBudgetImpact`, prompt when no project), explicit "no writes from Vercel" note. Also
  added root `app/page.tsx` redirect → `/status`.

**✅ PHASE 4 COMPLETE** — Next.js App Router: scaffold + design system, all 5 routes
(/status public, /dashboard, /submissions, /reports, /year-end) + /budget-impact, auth
gate, middleware, revalidate webhook, smart auto-refresh, theme, error/loading boundaries.

---

## PHASE 5 — Wiring, Validation & Hardening

- [x] **5.1 .env.example** — documented `APPS_SCRIPT_WEB_APP_URL`, `REVALIDATE_SECRET`
  (mirror of Apps Script `SURGE_REVALIDATE_SECRET`); noted no `NEXT_PUBLIC_*` needed,
  password lives in Settings sheet, and the Revalidate Webhook URL wiring.
- [x] **5.2 Apps Script deployment + Script Properties doc** — `SETUP.md`: full backend
  (buildAll → forms → settings → installTriggers → deploy → secrets) + frontend (env →
  dev → Vercel) steps, route/access table, token-cookie note. _(Noted: no advanced
  services needed — SpreadsheetApp/DriveApp built-in.)_
- [x] **5.3 E2E smoke test scripts** — `sheets/SmokeTest.gs` (`smokeTest()` asserts
  receipt→approve→move→CR→funding→cascade(Submitted→…→Reimbursed)→reconciliation+payment
  distribution; `smokeTestCleanup()`), `scripts/smoke.mjs` (node fetch of health+status).
- [x] **5.4 Settings configurability verification** — `VERIFICATION.md` §5.4: add/rename/
  delete/change flows mapped to the mechanisms (live named ranges, per-execution settings
  read, cascade handler, dashboard lists payload) — no code/redeploy; migration paste note.
- [x] **5.5 Vercel free-tier constraint audit** — `VERIFICATION.md` §5.5: each §6.5
  constraint with how we stay under + the quota-safe 3-layer caching; no paid add-ons.
- [x] **5.6 V2.2 hardening checklist** — `HARDENING.md`: every F1–F11, X1–X6, D1–D5, S1–S7
  mapped to its file/function, plus confirmed Removals. Final cross-check pass complete.

**✅ PHASE 5 COMPLETE** — `.env.example`, `SETUP.md`, `SmokeTest.gs` + `scripts/smoke.mjs`,
`VERIFICATION.md` (configurability + free-tier), `HARDENING.md` (full F/X/D/S map).

---

## 🎉 PROJECT COMPLETE — all 5 phases done.
- **Backend:** 26 `.gs` files (`/sheets/`) — schema bootstrap, full state-machine engine,
  JSON Web App API, dashboard aggregations + cache + webhook, smoke test.
- **Frontend:** Next.js App Router (`/src/`) — 6 routes, auth gate, middleware, 4 API
  routes, theme system, charts, smart auto-refresh, error/loading boundaries.
- **Docs:** PLAN.md, SETUP.md, VERIFICATION.md, HARDENING.md, .env.example.

---

## AUDIT-IMPROVEMENT PASS (post-V2.2) — execution tracker

Approved: A-1..A-5, B-1..B-5, C-1..C-3, D-1..D-3, E-1, E-2, F-1, F-2, G. Denied: E-3.

Commit groups:
- [x] G0 chore: git baseline + .gitattributes + tracker
- [x] G1 GAS submissions: server sort/dir + project/date/amount filters + distinct statuses (F-1, C-1/B-4, D-1, D-2 FY-scope+cache)
- [x] G2 GAS E-1 personal advances: `Advanced By` col (Expenses+Archive), COLS, moveRowToExpenses, Dashboard advances KPI/alert + payload
- [x] G3 Next lib: types/api updates (sort/filter params, statuses[], advances) + csv util
- [x] G4 Next UI shell: mobile nav (A-1), not-found (C-3), error/loading boundaries (A-3, C-2)
- [x] G5 Next UI submissions: sortable headers + filters + CSV + readability + row accents + A-4 (F-1, A-2, A-4, B-2, B-5, E-2, A-5, D-1)
- [x] G6 Next UI dashboard+reports: FY selector (B-1), advances section (E-1), reports CSV+sortable+helper (B-2, B-3, F-2)
- [x] G7 SETUP.md rewrite + README + HARDENING audit notes (G)
- [x] G8 final summary

## V3 EXECUTION (per ARCHITECTURE.md) — tracker

- [ ] V3-1 GAS loan engine: Config/COLS, Loans.gs, bootstrap (sheet+order+cache key+CF+migrateToV3),
      Triggers route, CR-Distributed hook, year-end item, Dashboard payload+alerts+cache,
      WebAppReports cache read, TimeDriven daily flags, Menu item
- [ ] V3-2 RichFormatting.gs — applyRichFormatting() one-time CF everywhere + menu entry
- [ ] V3-3 Frontend loans: types (LoansSummary, optional), checksum, LiabilitiesSection
      (replaces AdvancesSection), dashboard wiring
- [ ] V3-4 Paper Ledger tokens: globals.css rewrite (paper/ink), tailwind (serif, on-primary),
      layout fonts (Instrument Serif) + default theme light
- [ ] V3-5 Component conformance: Logo, Sidebar rail, AppShell widths (1100), status editorial
      hero + ScrollPath, callout classes (StatusRecordCard/ProgressBar), charts palette+cutout,
      year-end bar
- [ ] V3-6 Docs: SETUP upgrade steps + loans, HARDENING, onboarding guide regen, PLAN final
- **Resume:** if interrupted, run `claude --continue`; pick up at the first unchecked item.
  Icons verified for 0.439.0: PiggyBank/Banknote/Landmark/HandCoins/Scale/CircleDollarSign.
  GAS loans contract: see ARCHITECTURE.md §2.4/§4.2–4.3. `loans` is OPTIONAL in DashboardData
  (frontend must not crash before the Apps Script update).

## Current Session

- **Status:** V3 execution in progress (see tracker above).
- **Validation note:** no node in env — Vercel builds on push; statically verify imports/icons.

### Resume notes (read before continuing)
- **Phases 1–3 complete; Phase 4 in progress (4.1–4.9 done — `/status` fully works).**
- **Next.js files so far:** root configs (`package.json`, `next.config.mjs`, `tsconfig.json`,
  `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`); `src/app/layout.tsx` +
  `globals.css` (full design system); `src/middleware.ts`; `src/app/api/auth/route.ts`;
  `src/app/status/page.tsx`; `src/lib/{appsScript,api,types,format,auth,serverAuth}.ts`;
  `src/components/{ThemeProvider,ThemeToggle,NavBar,AuthGate,StatusLookupForm,StatusResults,
  StatusRecordCard,ProgressBar}.tsx` + `src/components/ui/{Skeleton,EmptyState,Badge}.tsx`.
- **Protected-page pattern (use for /dashboard, /submissions, /reports, /year-end):**
  Server Component → `const token = getServerToken(); if (!token) return <AuthGate area="…"/>;`
  → `const data = await getX(token); if ((data as any).error === 'unauthorized') return <AuthGate/>;`
  → render. Token flows server-side only.
- **Use existing lib:** `getDashboard/getSubmissions/getReport/getYearEnd/getBudgetImpact`
  (token-gated), `getStatus`/`getHealth` (public). Format via `formatCAD`, `statusBadgeClass`,
  `getProgress`, `relativeTime`. UI: `surge-card`, `badge-*`, `btn-*`, `input`, `skeleton`,
  `pulse-once`, `dot-live`. NO hardcoded hex in components (use token classes / var()).
- **Charts (4.11):** chart.js 4.4.1 + react-chartjs-2 already in package.json; chart
  components must be `'use client'` and theme-aware (read CSS vars or theme context).
- **Still to define (referenced once built):** `/api/revalidate` route (4.17),
  dashboard/submissions/reports/year-end pages + their `error.tsx` boundaries.

#### Original API-contract reference (unchanged)
- **API endpoints (all via `?action=`; token/password as PARAM, not header):**
  `health` → {status,lastRefresh,sheetId,version}; `authCheck` (POST password) → {ok,token}
  or {error}; `status&email=&id=` → {ok,email,records[],requestedId} | {disabled} | {error};
  `dashboard&fy=&token=` → {ok,kpis,charts{byCategory,byProject,byFundingSource,monthly,
  topSubmitters},pipeline,alerts,activity,reconciliation,readyToMoveCount,lists,lastRefresh};
  `submissions&page=&limit=&q=&status=&type=&token=` → {ok,page,total,totalPages,records[]};
  `report&type=&...&token=` → {ok,type,filter,summary{total,count,byCategory,byStatus},grant?};
  `yearend&token=` → {ok,checklist[]}; `budgetImpact&project=&amount=&token=` → {ok,impact}.
- **Record shape (status & submissions):** {id,type(Receipt|Mileage),name,email,vendor,
  description,amount,amountDisplay,status,event/project,date,submitted,crNumber,paymentDate,
  paymentMethod,receiptUrl,(distance,rateApplied for mileage),(rejectionReason|reviewNotes)}.
- **Next.js conventions (from prompt):** App Router + TS, Server Components by default,
  `'use client'` only where needed; NO direct Sheets calls from client — all data via the
  Apps Script Web App through `src/lib`; CSS uses ONLY the §4.1a/b custom properties (no
  hardcoded hex in components). Env: `APPS_SCRIPT_WEB_APP_URL`, `REVALIDATE_SECRET`.
- **Token transport:** browser holds token (localStorage `surge-auth`); Next.js server
  components/route handlers forward it to Apps Script as `&token=` (server-side, never
  exposed). Password sent once to authCheck.
- **Apps Script deploy:** run `buildAll()` then `installTriggers()`; deploy Web App as
  "Execute as Me / Anyone". `onSheetEdit` is the installable onEdit (not simple).
