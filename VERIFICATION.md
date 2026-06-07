# Verification — Configurability (§2.12) & Vercel Free-Tier (§6.5)

## 5.4 — Settings configurability (no code, no redeploy)

The Settings sheet is the single configuration surface. Verified flows:

| Change | How to do it | Why it propagates without code |
|---|---|---|
| **Add** a list item (event, category, funding source, …) | Type the value in the next blank cell of that `LIST:` block | `getListValues()` reads the `list_*` named range live; the range spans the whole 40-row block so new tail values are picked up on the next `onEdit` / 5-min recalc. Dropdowns (built from the named range) update automatically. |
| **Rename** a list item | Edit the cell in place | `handleSettingsEdit_` detects `e.oldValue→e.value`, scans references (AQ/Expenses/Budgets/Grants + CR `FS:` header), and offers a cascading rename (E4). |
| **Remove** a list item | Clear the cell | `handleSettingsEdit_` offers Reassign / Keep-as-orphan / Cancel (S5). Orphans never red-flag because all FK dropdowns use `allowInvalid:true` (S6). |
| **Change a setting** (password, thresholds, toggles, rate, cadence) | Edit the Value cell | `getSettingValue()` re-reads per execution (no stale cache); `getCfg()` maps every key. New keys are readable immediately via `getSettingValue('NewKey')`. |
| **New event/category appears on Vercel** | — | The dashboard `lists` payload is rebuilt by `refreshDashboardData()` (≤5 min) and surfaced to filters/dropdowns; reports/submissions read live lists via the cached dashboard. |

**Result:** adding events, categories, or funding sources — and changing the dashboard
password or any threshold — requires **no code edit and no redeploy**, satisfying the
"trivially editable by non-technical finance" priority.

> Migration note: bulk copy-paste of legacy rows is supported — `onEdit` is range-aware
> (F3), pasted Expenses rows get `Expense Type=Receipt` + computed `Fiscal Year`, and
> `allowInvalid:true` dropdowns never flag legacy values as invalid.

---

## 5.5 — Vercel free-tier constraint audit (§6.5)

| Constraint | Free-tier limit | How this build stays under |
|---|---|---|
| **Bandwidth** | 100 GB/mo | Payloads are small JSON; static assets cached; ISR serves cached HTML. No images/media. |
| **Build minutes** | 6,000/mo | One small Next.js app; ~2-min builds. |
| **Serverless function GB-hours** | 100 GB-hrs/mo | Server Components + tiny route handlers (auth, health, checksum, revalidate); no long-running work; all heavy compute is in Apps Script. |
| **Edge function bundle** | 1 MB | `middleware.ts` is minimal (in-memory fixed-window counter + redirect); no deps. |
| **No persistent servers** | — | Stateless: all state in Google Sheets; the only client persistence is the `surge-auth` cookie. |
| **Apps Script execution quota** | ~20k/day | 5-min backend pre-compute = 288 runs/day; `/status` protected by edge rate-limit + 60s per-email cache + 800/hr circuit breaker (§6.6). |

**Caching cadence (free, quota-safe):** 5-min backend pre-compute (Layer 1) + 180s ISR
(Layer 2) + on-edit `revalidateTag` webhook for significant changes (Layer 3 / D1). Routine
staleness ≤ ~3–5 min; key changes propagate in seconds.

No paid add-ons (no KV/Redis/edge config) are used anywhere.
