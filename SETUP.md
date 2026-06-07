# SFU Surge Finance Dashboard — Setup Guide

This guide is written for a **non-technical treasurer**. Follow the steps in order.
Everything here runs on **free tiers** (Google account + Vercel Hobby).

The system has two halves:
1. **The engine** — a Google Sheet + Apps Script (does all the work and stores data).
2. **The website** — a read-only dashboard hosted free on Vercel.

> Tip: keep this file open in one tab and do each step in another.

---

## PART 1 — The Google Sheet engine

### Step 1 — Create the spreadsheet
1. Go to **https://sheets.google.com**.
2. Click **Blank spreadsheet**.
3. Rename it (top-left) to e.g. `Surge Finance Database`.

✅ **What you should see:** an empty Google Sheet.

### Step 2 — Open the script editor
1. In the menu bar: **Extensions → Apps Script**.
2. A new tab opens (the Apps Script editor) with a file called `Code.gs`.

✅ **What you should see:** a code editor titled "Untitled project" (rename it to `Surge Finance` at the top if you like).

### Step 3 — Add the code files
1. Delete the contents of the default `Code.gs`.
2. For **each** file in the project's `sheets/` folder (there are ~28 `.gs` files):
   - Click the **+** next to "Files" → **Script**.
   - Name it the same as the file (e.g. `Config`), and paste that file's contents.
3. Save with **Ctrl/Cmd + S**.

✅ **What you should see:** all the `.gs` files listed in the left "Files" panel.

> You do **not** need to enable any "Advanced Services" — the code only uses built-in tools.

### Step 4 — Build the schema (creates all the tabs)
1. In the toolbar, open the **function dropdown** (says "Select function") and choose **`buildAll`**.
2. Click **Run** (▶).
3. The first time, Google asks you to **Review permissions** → choose your account → **Advanced → Go to Surge Finance (unsafe)** → **Allow**. (This is normal — it's your own script.)

✅ **What you should see:** back in the Sheet, ~13 tabs now exist (`Settings`, `Approval Queue`, `Expenses`, `CR Tracker`, `Grants`, `Budgets`, `Reconciliation`, `Audit Log`, `Dashboard Data`, `Archive`, etc.) and a toast "Bootstrap complete".

### Step 5 — Create the two Google Forms
You need two forms (Receipt and Mileage). Create each at **https://forms.google.com → Blank**.

**Receipt form — add these questions (exact titles):**
1. `Full Name` (short answer)
2. `Email Address for Interac e-Transfer Reimbursement` (short answer)
3. `Event / Project Name` (short answer)
4. `Date of Purchase (as shown on receipt)` (date)
5. `Amount Paid (CAD) (no $ symbol)` (short answer)
6. `Vendor / Store Name` (short answer)
7. `Describe the Expense (what and why?)` (paragraph)
8. `Was this pre-approved or part of a planned purchase?` (multiple choice)
9. `Upload Receipt (PDF or Image)` (file upload)
10. `Additional Notes (Optional)` (paragraph)

**Mileage form — add these questions (exact titles):**
1. `Full Name`
2. `Email Address for Interac e-Transfer Reimbursement`
3. `Event / Project Name`
4. `Date of Travel` (date)
5. `Distance Traveled (km)` (short answer)
6. `Reimbursement Rate` (multiple choice: `Standard`, `Custom`)
7. `Custom Rate ($/km)` (short answer)
8. `Upload Supporting Document (Optional)` (file upload)
9. `Additional Notes (Optional)`

**Link each form to the spreadsheet:** in the form, **Responses tab → Link to Sheets (green icon) → Select existing spreadsheet →** choose your `Surge Finance Database`.

✅ **What you should see:** two new tabs `Form Responses 1` (receipt) and `Form Responses 2` (mileage) appear in the Sheet.

### Step 6 — Configure your Settings
Open the **`Settings`** tab. It has a key/value area at the top and lists lower down.
1. **Dashboard Password** — change the Value cell from `Spendy-Otter` to your own password.
2. Scroll to the lists section and fill these (one entry per cell, in column B under the header):
   - `LIST: DirectorNames` — the **email addresses** of finance directors (must contain `@` to be enforced).
   - `LIST: CoordinatorNames` — coordinator emails.
   - `LIST: ProjectNames` — your events/projects.
   - `LIST: FundingSources` — your funding sources (keep `SFSS Club Grant`, `Club Bank Account`, etc.).
3. (Optional) **Receipts Root Folder ID** — to auto-file receipts: create a Drive folder, open it, and copy the long ID from its URL (`drive.google.com/drive/folders/`**`THIS_PART`**) into the Value cell.

✅ **What you should see:** your password and names saved in the Settings tab. (No "save" button needed — Sheets autosaves.)

### Step 7 — Turn on the automations (triggers)
1. Back in the **Apps Script** tab, choose **`installTriggers`** in the function dropdown → **Run**.

✅ **What you should see:** a toast "Triggers installed…". (You can verify under the **clock icon → Triggers** in the Apps Script left sidebar — you'll see form-submit, edit, change, and time-based triggers.)

### Step 8 — Publish the engine as a Web App
1. In Apps Script, top-right: **Deploy → New deployment**.
2. Click the **gear ⚙ → Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. Click **Deploy** → **Authorize** if asked.
5. **Copy the Web app URL** (ends in `/exec`). Keep it — you'll paste it into Vercel.

✅ **What you should see:** a "Deployment successfully updated" dialog with a URL like
`https://script.google.com/macros/s/AKfy.../exec`.

### Step 9 — Get the webhook secret
1. In Apps Script: **Project Settings (⚙ gear, left sidebar) → Script Properties**.
2. If you don't see `SURGE_REVALIDATE_SECRET` yet, run any function once (e.g. `buildAll` already created it), then refresh.
3. **Copy the value** of `SURGE_REVALIDATE_SECRET`. Keep it for Vercel.

✅ **What you should see:** two properties, `SURGE_HMAC_SECRET` and `SURGE_REVALIDATE_SECRET`, each with a long value.

---

## PART 2 — The website (Vercel, free)

You don't have a Vercel account yet — these steps create one. Vercel deploys from a
GitHub repository, so you'll put the code on GitHub first (also free).

### Step 10 — Put the code on GitHub
1. Create a free account at **https://github.com/signup**.
2. Click **+ (top right) → New repository**, name it `surge-finance`, set **Private**, **Create repository**.
3. Follow GitHub's "push an existing repository" snippet in a terminal inside the project folder:
   ```bash
   git remote add origin https://github.com/<your-username>/surge-finance.git
   git branch -M main
   git push -u origin main
   ```

✅ **What you should see:** your files listed on the GitHub repo page.

### Step 11 — Create a Vercel account
1. Go to **https://vercel.com/signup**.
2. Choose **Continue with GitHub** and authorize Vercel (stay on the free **Hobby** plan).

✅ **What you should see:** the Vercel dashboard ("Let's build something new").

### Step 12 — Import and configure the project
1. Click **Add New… → Project**.
2. Find `surge-finance` → **Import**.
3. Vercel auto-detects **Next.js** — leave the build settings as-is.
4. Expand **Environment Variables** and add these two (copy-paste, replace the values):
   ```
   APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/AKfy.../exec
   REVALIDATE_SECRET=<the SURGE_REVALIDATE_SECRET value from Step 9>
   ```
5. Click **Deploy**.

✅ **What you should see:** a build log, then "Congratulations" with a live URL like
`https://surge-finance.vercel.app`. Open it — it redirects to the **Status** page.

### Step 13 — Connect the live-update webhook
1. Copy your Vercel URL and add `/api/revalidate` to it
   (e.g. `https://surge-finance.vercel.app/api/revalidate`).
2. In the Sheet's **`Settings`** tab, paste it into the **Revalidate Webhook URL** Value cell.

✅ **What you should see:** edits in the Sheet now refresh the website within seconds (otherwise it still refreshes every few minutes on its own).

---

## PART 3 — Using the app (where everything is)

**On the website (top navigation):**
- **Status** (public) — anyone enters their email to see their reimbursement status + progress bar.
- **Dashboard** (password) — KPIs, charts, alerts, pipeline, recent activity. Use the **Fiscal Year dropdown** (top-right) to view past years. The **"Personal Advances (owed back)"** card shows money you fronted that the club still owes you.
- **Submissions** (password) — every receipt/mileage. **Click any column header to sort**; use **search, Status/Type/Project filters, date & amount ranges** ("More filters"), and **⬇ Export CSV**.
- **Reports** (password) — pick a type (Monthly / Event / Grant / Term / Year-End) → **Generate** → **Print/PDF** or **Export CSV**.
- **Year-End** (password) — a checklist of what's left before closing the fiscal year.

On phones, tap the **☰** menu (top-right) to switch pages.

**In the Google Sheet (the ⚡ Surge Finance menu, top bar):**
- **Move to Expenses** (single / all / selected) — promote approved items.
- **Create Cheque Requisition**, **Cancel CR**, **Undo Move**, **Delete Selected Expense**.
- **Refresh Dashboard Data**, **Year-End Rollover**, **Archive Prior Years**.

**Common changes (no code needed):**
- **Change the password:** Settings tab → `Dashboard Password` value.
- **Add an event / category / funding source:** type it in the next blank cell under the matching `LIST:` block. It appears in dropdowns and the website automatically.

### How to record a "paid before SFSS" personal advance (E-1)
When a member needs the money before SFSS reimburses the club, and you pay them yourself:
1. In the **Expenses** tab, find the member's row.
2. Set **Payment Method** → `E-Transfer (via Finance Director)` and **Reimbursement Status** → `Reimbursed` (the member is now paid).
3. In the new **`Advanced By`** column (far right), type **your name** (whoever fronted the money).
4. The Dashboard's **Personal Advances** card now shows the club owes you that amount.

✅ It clears automatically once the linked **CR is marked `Distributed`** (SFSS paid the club back), or when you blank out the `Advanced By` cell after being repaid.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **"Missing sheet: …" error** | You skipped Step 4. Run **`buildAll`** in Apps Script. |
| **Website shows the password box repeatedly** | Wrong password, or you changed it in Settings. Use the current `Dashboard Password` value. |
| **Dashboard banner: "Unable to connect to data source"** | The `APPS_SCRIPT_WEB_APP_URL` in Vercel is wrong/old, or the Web App access isn't "Anyone". Re-check Steps 8 & 12, then **redeploy** in Vercel (Deployments → ⋯ → Redeploy). |
| **Dashboard is empty / all $0** | No data yet, or you're viewing a fiscal year with no expenses — switch the **FY dropdown** to Current FY. |
| **Edits in the Sheet don't show on the site** | Set the **Revalidate Webhook URL** (Step 13). Without it, the site still updates within ~3–5 minutes automatically. |
| **`/api/revalidate` returns 401** | `REVALIDATE_SECRET` in Vercel must exactly match `SURGE_REVALIDATE_SECRET` (Step 9). Update it in Vercel → Settings → Environment Variables → Redeploy. |
| **Forms aren't creating rows in Approval Queue** | Re-run **`installTriggers`** (Step 7) and confirm the forms are **linked** to this spreadsheet (Step 5). |
| **"This form is no longer accepting responses" / "Fix file upload settings"** | This is a **Google Forms/Drive** issue, not the script (the script never deletes uploaded files — it only optionally renames/moves them, with error handling). Fix in this order: **(1)** In the form: **Responses tab → toggle "Accepting responses" ON**. **(2)** In the form editor, click **"Fix file upload settings"** — it names the exact problem (usually storage). **(3)** Check the form-owner account's **Google Drive storage** at **one.google.com/storage** — file-upload forms stop accepting uploads when the owner's 15 GB is full; free up space (empty Drive Trash, delete large Gmail attachments) or use a Google Workspace/club account. **(4)** Make sure the **"[Form name] (File responses)" folder** in the owner's Drive is **not in Trash**. **(5)** In **Settings (gear) → Responses**, ensure **"Limit to 1 response" is OFF**. **(6)** If you'd rather the script never touch uploaded files, **blank out the `Receipts Root Folder ID`** cell in the Settings tab — that disables all file moving. |
| **A finance action says "Director-only"** | Add that person's **email** to `LIST: DirectorNames` in Settings. |
| **Receipts not moving into folders** | Set **Receipts Root Folder ID** in Settings (optional feature). |
| **Changed code — site didn't update** | Push to GitHub (`git push`); Vercel redeploys automatically. For Apps Script changes, **Deploy → Manage deployments → Edit → Deploy** to publish a new version. |
