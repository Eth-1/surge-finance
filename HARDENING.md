# V2.2 Hardening Checklist — Implementation Map (§5.6)

Every stress-test resolution from Part 8, mapped to the file/function that implements it.

## Functionality & Logic (F)

| ID | Item | Implementation |
|---|---|---|
| **F1/F2** | LockService on every status-mutating handler; honest `Last Modified` (no versioning) | `Lock.gs` → `withLock` (10s tryLock, re-entrant), `touchLastModified`; used by every mutator (ApprovalQueue/Expenses/Mileage/CRTracker/Reconciliation/Menu/BudgetModal/Archive). |
| **F3** | Range-aware `onEdit` for bulk paste | `Triggers.gs` → `onSheetEdit`, `rangeInfo_`, `eachDataRow_`; `handleApprovalQueueEdit_`, `handleExpensesEdit_`. |
| **F4** | Budget Impact recompute inside lock at confirm (TOCTOU) | `BudgetModal.gs` → `confirmBudgetMove` (recompute + "budget changed" re-confirm). |
| **F5** | Transactional mileage move (build → single write → verify → set Processed) | `Mileage.gs` → `moveMileageToExpenses` (never resets Processed after a verified write). |
| **F6** | Formula-vs-Script declared per computed column; `COALESCE`→`IF()` | `Utils.gs` `coalesceAmount`; per-row formulas `_statusAgeFormula_` (Expenses), `buildFundingCheckFormula_` (CRTracker), live Recon formulas; script sums in Grants/Budgets. |
| **F7** | Fiscal Year recomputes on Purchase Date edit (not just daily) | `Expenses.gs` `normalizeExpenseRow_` (onEdit) + `TimeDriven.gs` `refreshAllExpenseFiscalYears_` (daily). |
| **F8** | Undo Move restores AQ by Row-ID match, never index | `Expenses.gs` `undoMoveToExpenses` via `Config.gs` `findRowByValue_`. |
| **F9** | Mileage rate single source of truth | `Config.gs` `getCfg().mileageStandardRate`; used in `Forms.gs` + `Mileage.gs` (no hardcoded 0.22). |
| **F10** | Payment Distribution idempotent (Row-ID set + lock) | `Reconciliation.gs` `generatePaymentDistribution`. |
| **F11** | Cancelled CRs excluded from Reconciliation | `Reconciliation.gs` `recalculateReconciliation` + `computeReconciliationSummary_`. |

## Intuitive UX (X)

| ID | Item | Implementation |
|---|---|---|
| **X1** | Batch move: persistent skip panel + in-sheet highlight; non-contiguous selection | `Menu.gs` `batchMove_`, `_highlightSkippedRow_`, `_showBatchResultsPanel_`, `collectSelectedRows_` (`getActiveRangeList`). |
| **X2** | Self-service email normalized | `Utils.gs` `normalizeEmail`; `WebAppEndpoints.gs` `handleStatus_`; `StatusLookupForm.tsx`. |
| **X3** | Soft cross-field guards on manual edits | `Expenses.gs` `onExpenseStatusEdit_`; `CRTracker.gs` `handleCRStatusChange_` (zero-expense guard). |
| **X4** | Live "ready to move" count + nudge + dashboard info alert | `Menu.gs` `buildSurgeMenu_`/`countFullyApproved_`; `Dashboard.gs` `_computeAlerts_`. |
| **X5** | Password remembered (no per-tab re-entry) | `Auth.gs` `signToken` (7d); Next `app/api/auth/route.ts` httpOnly cookie + `lib/auth.ts`. |
| **X6** | `Action Required` at step 5 "Info Requested" on CR bar | `lib/format.ts` `getProgress`; `ProgressBar.tsx`. |

## Design & Architecture (D)

| ID | Item | Implementation |
|---|---|---|
| **D1** | Apps Script → Next.js revalidate webhook (tags actually fire) | `Dashboard.gs` `notifyRevalidate_` (30s debounce); Next `app/api/revalidate/route.ts` (`revalidateTag`). |
| **D2** | Fully Approved visual distinction (accent + pulse) | `bootstrap.gs` CF accent lane on AQ col A; `ui/Badge.tsx` `pulse-once`; submissions table. |
| **D2/D3** | Aligned quota-safe refresh + client-render-first | 5-min `scheduledRecalc` (`TimeDriven.gs`) + 180s ISR (`lib/api.ts`) + webhook; `loading.tsx` + `ui/Skeleton`. |
| **D4** | Reliable archive (copy-verify-then-delete, prior-FY only, reports union) | `Archive.gs` `archivePriorYears_`; `WebAppReports.gs` `_reportSourceRows_` (Archive union). |
| **D5** | Receipt validation via Drive API by file ID | `TimeDriven.gs` `validateReceiptLinks`; `Utils.gs` `extractDriveFileId`. |

## Security & Access (S)

| ID | Item | Implementation |
|---|---|---|
| **S1** | `/status` DoS protection (edge limit + per-email cache + circuit breaker) | Next `middleware.ts`; `WebAppEndpoints.gs` `handleStatus_` 60s cache; `RateLimit.gs` `checkStatusCircuitBreaker`. |
| **S2** | Token auth (POST password → signed token; hashed compare; brute-force limit; no password in URLs on data calls) | `Auth.gs` (`hashPassword`/`verifyPassword`/`signToken`/`verifyToken`); `handleAuthCheck_`; `RateLimit.gs` `checkAuthRateLimit`; Next `api/auth`. |
| **S3** | Deep links omit email; ID-ownership re-checked | `WebAppEndpoints.gs` `handleStatus_` (`requestedId` owned check); `StatusRecordCard.tsx` copy-link (id only); `StatusResults.tsx`. |
| **S4** | Concrete rate-limit numbers; enumeration tradeoff documented | `Settings` defaults (§6.6) + `RateLimit.gs`; `VERIFICATION.md` §5.5. |
| **S5/S6** | Settings delete cascade (reassign/orphan/cancel) + validation tolerates legacy values | `Settings.gs` `handleSettingsEdit_`; S6 satisfied structurally by `allowInvalid:true` dropdowns (`bootstrap.gs`). |
| **S7** | Audit `User` fallback chain; never blank | `Audit.gs` `resolveAuditUser_`. |

## Removals (confirmed absent)

| Removed | Verification |
|---|---|
| On-Behalf-Of | No such column in any schema (`bootstrap.gs`); submitted email is the recipient. |
| `Auto-Approved` status string | Auto-approve sets real coordinator/director names (`Forms.gs`), status `Fully Approved`. |
| Forgeable base64 share tokens | Self-service uses direct email entry; deep links carry only the record id (S3). |
| Email notifications | Not implemented (out of scope). |
| "Version" optimistic-lock column | Replaced by `Last Modified` + `LockService` (F1/F2). |

---

**Status: all V2.2 hardening items implemented.** Backend = 26 `.gs` files (incl.
`SmokeTest.gs`); frontend = Next.js App Router with 6 routes + auth/health/checksum/
revalidate API routes.
