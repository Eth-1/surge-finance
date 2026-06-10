import type { DashboardData } from "./types";

/**
 * A stable signature of the values the smart auto-refresh watches (§4.5f):
 * KPI values + alert count + pipeline counts/totals + ready-to-move count.
 * Identical data → identical checksum → no "data updated" toast.
 */
export function dashboardChecksum(d: DashboardData): string {
  const k = d.kpis;
  const pipe = d.pipeline.map((p) => `${p.status}:${p.count}:${p.total}`).join(",");
  return [
    k.totalExpenses, k.outstanding, k.activeCRs, k.totalGrants, k.avgGrantUtilization,
    d.alerts.length, d.readyToMoveCount,
    d.loans?.outstandingTotal ?? 0, d.loans?.overdueCount ?? 0,
    pipe,
  ].join("|");
}
