/** Presentation helpers: currency, status→badge, progress-bar logic (§4.2, §4.4). */

import type { BadgeClass, StatusRecord } from "./types";

/** Format a number as CAD (mirrors the GAS formatCAD). */
export function formatCAD(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  const v = isNaN(n) ? 0 : Math.round(n * 100) / 100;
  const neg = v < 0;
  const parts = Math.abs(v).toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-$" : "$") + parts[0] + "." + parts[1];
}

/** Map any status string to a badge class (§4.2). */
export function statusBadgeClass(status: string): BadgeClass {
  const s = String(status || "").trim();
  switch (s) {
    case "Reimbursed":
    case "Distributed":
    case "Fully Approved":
    case "Approved":
    case "Approved by SFSS":
    case "Cheque Received":
    case "Appeal Approved":
    case "Payment Received":
      return "badge-success";
    case "Action Required":
      return "badge-action";
    case "Rejected":
    case "Rejected / Cancelled":
    case "Denied":
      return "badge-danger";
    case "Follow Up":
    case "Follow Up Required":
    case "Awaiting Payment":
      return "badge-warning";
    case "Cancelled":
      return "badge-neutral";
    default:
      // Pending / Coordinator Approved / Director Approved / Submitted / CR* / Draft / etc.
      return "badge-info";
  }
}

/** "x minutes ago" for the stale-data indicator (§6.4). */
export function relativeTime(iso: string): string {
  if (!iso) return "unknown";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "unknown";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + (min === 1 ? " minute ago" : " minutes ago");
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + (hr === 1 ? " hour ago" : " hours ago");
  return Math.floor(hr / 24) + " day(s) ago";
}

/* ------------------------------------------------------------------ *
 * Self-service progress bar (§4.4). CR path = 8 steps, direct = 4.    *
 * ------------------------------------------------------------------ */
export const CR_STEPS = ["Submitted", "Review", "Approved", "CR Filed", "Submitted\nto SFSS", "Awaiting\nPayment", "Payment\nReceived", "Reimbursed"];
export const DIRECT_STEPS = ["Submitted", "Review", "Approved", "Reimbursed"];

export interface Progress { variant: "cr" | "direct"; steps: string[]; current: number; actionRequired: boolean; rejected: boolean; }

const CR_STEP_BY_STATUS: Record<string, number> = {
  Pending: 2, "Coordinator Approved": 2, "Director Approved": 2,
  "Fully Approved": 3, Approved: 3,
  "CR Draft": 4, "CR Ready to Submit": 4,
  "CR Submitted": 5,
  "Awaiting Payment": 6, "Follow Up Required": 6,
  "Payment Received": 7,
  Reimbursed: 8,
};
const DIRECT_STEP_BY_STATUS: Record<string, number> = {
  Pending: 1, "Coordinator Approved": 1, "Director Approved": 1,
  "Fully Approved": 2, Approved: 2,
  "Payment Received": 3,
  Reimbursed: 4,
};

/** Resolve progress for a self-service record. Action Required → CR step 5 (X6). */
export function getProgress(record: Pick<StatusRecord, "status" | "crNumber">): Progress {
  const status = String(record.status || "").trim();
  const rejected = status === "Rejected" || status === "Rejected / Cancelled";
  const isCr = !!String(record.crNumber || "").trim();

  if (isCr) {
    const actionRequired = status === "Action Required";
    const current = rejected ? 0 : actionRequired ? 5 : CR_STEP_BY_STATUS[status] || 1;
    return { variant: "cr", steps: CR_STEPS, current, actionRequired, rejected };
  }
  const current = rejected ? 0 : DIRECT_STEP_BY_STATUS[status] || 1;
  return { variant: "direct", steps: DIRECT_STEPS, current, actionRequired: false, rejected };
}
