# Surge Finance — 2025 Redesign Brief & Audit

> Status: **AUDIT + DIRECTION** (no code yet). Awaiting sign-off on the dependency
> gate (§4) and two IA calls (§6) before Chunk 1.

---

## 1. What this product is, and who it's for

**Surge Finance** is the reimbursement + finance-operations system for an SFU student
club. The engine lives in Google Sheets + Apps Script (forms → approval → expenses →
cheque requisitions to the SFSS → reimbursement). This repo is the **read-only Next.js
front-end** on Vercel that reads a JSON API from the Apps Script Web App. **All mutations
happen in the Sheet**; the website displays and explains.

Two very different audiences share one app today:

| Audience | Who | Frequency / device | Job-to-be-done |
|---|---|---|---|
| **Club members** (public) | Students who bought something / drove | Rare, **mostly phone** | "Submit a receipt, then: *did my money come through, and where is it?*" |
| **Finance team** (Coordinator/Director) | 1–3 exec members | Weekly, desktop + phone | "What needs my attention, what's outstanding, is the budget healthy, generate a report, close the year." |

### Per-route job-to-be-done (routes are frozen)

| Route | Audience | JTBD |
|---|---|---|
| `/status` | Public | Track my reimbursement; submit a new one; understand the process |
| `/dashboard` | Finance | Triage what needs action; read club financial health at a glance |
| `/submissions` | Finance | Find/scan/export any submission across the whole ledger |
| `/reports` | Finance | Produce a monthly/event/grant/term/year-end summary |
| `/year-end` | Finance | See what's left before closing the fiscal year |
| `/budget-impact` | Finance | Preview a project's budget before approving an expense |

---

## 2. Audit — where the current UI gets in the way

The app is **competent**, not broken (a recent pass added mobile nav, sortable tables, CSV,
FY selector, advances, FAQ, animations). The bar now is "well-funded 2025 product," so this
audit is about elevation, identity, and IA — not fixing rubble.

### 2.1 Visual identity — *generic*
- The palette is default **indigo-on-slate** — the "developer dashboard starter" look. No
  brand personality for *Surge* (a name that literally means a rush of energy/electricity).
- Brand mark is the **⚡ emoji**. All iconography is emoji (📎 🧾 🚗 🔧 ✅ ⚠️ 🔴 🟡) — these
  render inconsistently across OSes, can't inherit color/weight, and read as "prototype."
- Type is single-family Inter at small sizes with weak hierarchy; headings are barely larger
  than body. No display scale, no tabular-figure treatment beyond a few spots.
- Cards are flat with hairline borders; little intentional depth or rhythm.

### 2.2 Navigation & information architecture — *one shell for two products*
- A single top-tab `NavBar` shows **Status · Dashboard · Submissions · Reports · Year-End to
  everyone**, including the public `/status` page. Members see five finance tabs they can't
  use (clicking prompts a password), which is confusing and leaks the gated surface area.
- For the finance side, top tabs don't scale like a real console. There's no persistent
  context (page title, FY, account, sign-out), no global search, no command palette.
- `/budget-impact` exists but is unreachable from any nav (orphan route).

### 2.3 Page-level friction
- **/status** (highest-traffic, most public): recently improved, but the email gate is a bare
  input, the progress stepper is utilitarian, and there's no "package-tracking" reassurance or
  per-record timeline. It's *fine*; it should be *delightful*.
- **/dashboard**: a long vertical stack (KPIs → alerts → charts → pipeline+activity →
  advances). No "needs attention first" priority; pipeline is a list, not a funnel; charts use
  near-default Chart.js styling; the FY control is a raw `<select>`.
- **/submissions**: solid table, but on phones it **horizontally scrolls** (poor touch UX); no
  row-detail, no column/density control, no sticky header.
- **/reports**: works; feels like a form, not a "report builder"; print layout is basic.
- **/year-end**: a plain checklist; could be a satisfying progress experience.

### 2.4 Mobile
- Nav collapses to a hamburger **dropdown** (works, but a bottom tab bar feels native).
- Tables scroll sideways; some tap targets (<24px) and the sort `↕` carets are small.
- Charts (doughnut legends on the right) get cramped.

### 2.5 Accessibility (WCAG AA gaps to close)
- No skip-to-content link; landmarks are thin.
- Focus-visible styling is inconsistent (relying on browser default).
- Several text/emoji-on-tint combos and `text-muted` on tinted cards need contrast checks.
- Status conveyed partly by color/emoji alone (needs text + shape/label too).
- Live regions for the auto-refresh/“copied” toasts aren't announced.

### 2.6 Functionality users likely don't know exists
Deep-link sharing of a single record, **CSV export** (status + submissions + reports), the
**fiscal-year selector**, the **personal-advances** tracker, the five **report types**,
the **budget-impact** preview, Receipt-vs-Mileage typing, and **copy-link**. All real, all
under-surfaced.

### 2.7 What a 2025 product like this normally has — and we don't
- A **command palette (⌘K)** + keyboard shortcuts for power users.
- A real **icon system** and brand mark; proper **favicon / OG image / app metadata**.
- A unified **toast/notification** system with live-region announcements.
- **System/auto theme** option (we have dark/light only).
- **Density** and **mobile card** views for data tables.
- Considered **empty / loading / error** states with personality (we have baseline ones).
- Polished **auth screen** (current `AuthGate` is a plain card).

---

## 3. Proposed design direction

> Decisive choices, briefly justified. Everything below is reversible per-token.

### 3.1 Identity — "controlled energy"
- **Brand:** lean into *Surge*. One electric brand hue (indigo→violet) + a cyan/teal accent,
  expressed as a restrained **signature gradient** used only for the logo, primary CTA, and the
  active nav rail. Everything else stays calm so finance data reads clearly.
- **Neutrals:** a deeper, cooler near-black dark theme (layered surfaces with a faint top
  highlight for true elevation) and a crisp, warm-white light theme. Both AA-checked.
- **Type:** keep **Inter** (already loaded via `next/font` — not an npm dep). Introduce a real
  scale (display/H1/H2/body/caption), heavier display weights, tighter tracking on big numbers,
  and **tabular figures everywhere money appears**. (Optional: a distinct display face — flagged.)
- **Depth & motion:** soft layered shadows + 1px borders; glass only on sticky bars. Motion is
  **functional** — entrance stagger, hover lift, the active progress step, view fades — all CSS,
  all `prefers-reduced-motion`-aware.
- **Tokens:** expand `globals.css` into a proper system (neutral ramp, brand ramp, semantic
  ramps, elevation, radius, spacing rhythm, motion, z-index). Components keep referencing tokens
  only (no hex in components) — so theming stays centralized.

### 3.2 Information architecture — two shells, one codebase
- **Public shell** (`/status`): a focused, friendly chrome — logo + theme toggle only, big
  submit CTAs, no finance tabs. A discreet "Finance team →" link routes to `/dashboard`
  (which still prompts for the password). Nothing removed; members just aren't shown gated tabs.
- **Finance console shell** (gated routes): a persistent **left sidebar** (logo, icon nav,
  active rail, collapsible) + a **top context bar** (page title, FY selector, ⌘K/search,
  theme, sign-out) on desktop; a **bottom tab bar** on mobile. `/budget-impact` gets a home
  (linked from dashboard budget cards). Implemented with a client `AppShell` that switches
  chrome by `usePathname` — **routes and auth gating unchanged**.

### 3.3 Signature upgrades (all within the frozen API)
- **/status → "track your reimbursement":** a reassuring hero, summary chips kept, each record
  rendered as a compact **timeline** with the existing stages; shareable; export kept.
- **/dashboard:** "Needs attention" surfaced first; KPI cards refined with tabular figures;
  pipeline rendered as a **funnel**; charts restyled to match the system; FY selector becomes a
  real control. (No invented data — only what the API already returns.)
- **/submissions:** sticky header, density toggle, **mobile card view**, row click → detail
  drawer (read-only), keyboard-navigable; filters/sort/CSV preserved.
- **Command palette (⌘K):** jump to pages + quick actions (open forms, export). Keyboard-first.
- **Toast system + live regions; system theme; skip link; full focus-visible.**
- **Brand metadata:** SVG favicon, OG image, titles/descriptions.

---

## 4. Dependencies — NEEDS APPROVAL (hard rule #4)

Default plan adds **zero** npm dependencies (CSS-only motion, hand-rolled inline-SVG icons).
But two would raise quality with low risk:

| Candidate | Why | Cost / risk | My recommendation |
|---|---|---|---|
| **`lucide-react`** (icons) | Replaces emoji with a consistent, recolorable, accessible icon set — biggest single jump in "real software" feel | ~tree-shakeable, small per-icon; well-maintained | **Recommend adding.** Fallback: hand-rolled inline SVGs (more code, zero dep). |
| **`framer-motion`** (motion) | Spring/layout animations, palette transitions | +~30–40KB; not needed for our motion | **Skip** — CSS covers it and keeps the bundle lean for the Vercel free tier. |
| Display font via `next/font` | Distinct headings | Not an npm dep; small perf cost of a 2nd family | Optional — I lean **Inter only**. |

I will proceed **CSS-only + inline-SVG (zero new deps)** unless you approve `lucide-react`.

---

## 5. Execution plan (logical chunks)

1. **Design foundation** — expand `globals.css` token system + Tailwind config; type scale;
   motion/focus/skip-link primitives. (Re-skins everything at once via tokens.)
2. **App shell & IA** — `AppShell` (public bar vs finance sidebar + mobile bottom nav), icon
   system, brand mark, command palette, toast system, theme (add "system").
3. **/status redesign** — hero, lookup, summary, record timelines, FAQ, share/export.
4. **/dashboard redesign** — attention-first layout, KPI + funnel + restyled charts + advances.
5. **/submissions redesign** — sticky/density/mobile-cards/detail drawer.
6. **/reports + /year-end + /budget-impact + AuthGate** — polish + report builder feel.
7. **A11y + metadata + QA pass** — AA contrast sweep, keyboard, reduced-motion, favicon/OG,
   loading/empty/error states, and a build/typecheck.

Each chunk ends with a summary (changed / deliberately-not-changed / next) and I'll pause on
anything that needs your call.

---

## 6. Open judgment calls (want your steer)

1. **Icons:** approve `lucide-react`, or stay zero-dep with inline SVGs?
2. **Motion:** CSS-only (my rec) or approve `framer-motion`?
3. **Public IA:** OK to hide the finance tabs on the public `/status` page (members see only
   Status + submit CTAs, with a discreet "Finance team" login link)? Nothing is removed —
   finance users navigate via the console shell after the password.
