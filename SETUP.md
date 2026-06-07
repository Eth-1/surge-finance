# SFU Surge Finance Dashboard V2.2 — Setup Guide

Two halves: the **Google Sheets + Apps Script backend** and the **Next.js/Vercel frontend**.

---

## Part A — Google Sheets + Apps Script backend

### 1. Create the workbook & script
1. Create a new Google Sheet (this becomes the database).
2. **Extensions → Apps Script** to open the bound script project.
3. Add every file from `/sheets/*.gs` into the project (one script file each; names
   don't matter to GAS but keep them for clarity). No HTML files are required — the
   Budget Impact and batch-results UIs are built inline via `HtmlService.createHtmlOutput`.
4. **Advanced services are NOT required** — the engine uses built-in `SpreadsheetApp`
   and `DriveApp` only. (Authorize Drive + Sheets scopes when first prompted.)

### 2. Build the schema
- Run **`buildAll()`** once (from `bootstrap.gs`). This creates all 13 sheets, headers,
  validations, conditional formatting, and the `list_*` named ranges. Safe to re-run.

### 3. Link the two Google Forms
- Create the **Receipt** form (fields per §2.2) and the **Mileage** form (§2.3) and link
  their responses to this spreadsheet. They will replace the header-only
  `Form Responses 1` / `Form Responses 2` stubs. (Field names must match §2.2/§2.3.)

### 4. Configure Settings (Settings sheet)
- **Dashboard Password** — change from the default `Spendy-Otter`.
- **CoordinatorNames / DirectorNames** — for role enforcement (§1.5), enter the finance
  team **emails** (entries containing `@` are matched against the signed-in user; a
  names-only list cannot be enforced and defers to sheet sharing).
- **AuthorizedCRSubmitters / AuthorizedChequePickups** — dropdown options.
- **Receipts Root Folder ID** — Drive folder ID for receipt organization (optional).
- **Revalidate Webhook URL** — `https://<your-vercel-domain>/api/revalidate` (enables D1).
- Adjust thresholds/toggles as needed (all documented in the sheet's Description column).

### 5. Install triggers
- Run **`installTriggers()`** once. This wires: `onFormSubmit`, the installable
  `onSheetEdit` (UrlFetch-capable), `onChange`, a 5-minute `scheduledRecalc`, and a daily
  `dailyScheduledChecks`. Re-running clears and reinstalls cleanly.

### 6. Deploy the Web App
- **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**.
- Copy the `…/exec` URL → this is `APPS_SCRIPT_WEB_APP_URL`.

### 7. Secrets (Script Properties)
- `SURGE_HMAC_SECRET` and `SURGE_REVALIDATE_SECRET` auto-generate on first use
  (`getSecret()` / `getRevalidateSecret()`). Open **Project Settings → Script Properties**,
  copy `SURGE_REVALIDATE_SECRET`, and set it as Vercel's `REVALIDATE_SECRET`.
- Rotate the HMAC secret any time to revoke all outstanding dashboard tokens (§1.6).

---

## Part B — Next.js / Vercel frontend

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill `APPS_SCRIPT_WEB_APP_URL` +
   `REVALIDATE_SECRET` (see Part A steps 6–7).
3. `npm run dev` → http://localhost:3000 (redirects to `/status`).
4. **Deploy to Vercel**: import the repo, set the same two env vars in Project Settings,
   deploy. Set the Settings-sheet **Revalidate Webhook URL** to the deployed
   `/api/revalidate`.

### Routes
| Route | Access |
|---|---|
| `/status` | Public (email-gated lookup) |
| `/dashboard`, `/submissions`, `/reports`, `/year-end`, `/budget-impact` | Password gate |

The password gate stores a signed HMAC token in the `surge-auth` httpOnly cookie
(7-day expiry). Server Components read it and forward it to Apps Script server-side.

---

## Smoke test
After both halves are deployed, run `smokeTest()` in Apps Script (see `SmokeTest.gs`) to
exercise the form→approve→move→CR→cascade→reconcile path, then load `/dashboard`.
