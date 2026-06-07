# SFU Surge Finance Dashboard

A free, read-only finance dashboard for an SFU club, backed by Google Sheets + Apps Script
and a Next.js frontend on Vercel.

- **Engine:** Google Sheets + Apps Script (`/sheets/*.gs`) — intake forms, dual approvals,
  cheque requisitions, grants, budgets, reconciliation, audit log, JSON Web App API.
- **Website:** Next.js App Router (`/src/`) — public self-service status lookup +
  password-gated dashboard, submissions, reports, and year-end views.
- **Cost:** runs entirely on free tiers (Google account + Vercel Hobby).

## Getting started
See **[SETUP.md](SETUP.md)** — a numbered, non-technical, step-by-step guide
(Google Sheet → Apps Script → Forms → deploy → GitHub → Vercel) with a troubleshooting
section.

## Key features
- **/status** — members check their reimbursement status by email (dynamic progress bar).
- **/dashboard** — KPIs, 5 charts, alerts, pipeline, activity, fiscal-year selector, and an
  **outstanding personal-advances** tracker.
- **/submissions** — searchable, sortable, filterable table with CSV export.
- **/reports** — monthly / event / grant / term / year-end summaries, printable + CSV.
- **/year-end** — fiscal-year close checklist.
- In-sheet **⚡ Surge Finance** menu for all finance actions (move to expenses, CRs, etc.).

## Docs
- [SETUP.md](SETUP.md) — install & deploy.
- [VERIFICATION.md](VERIFICATION.md) — configurability + free-tier audit.
- [HARDENING.md](HARDENING.md) — security/reliability implementation map.
- [PLAN.md](PLAN.md) — build + audit-pass task history.
