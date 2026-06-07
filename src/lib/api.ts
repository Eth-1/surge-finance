/** Typed endpoint getters wrapping fetchAppsScript (server-side). */

import { fetchAppsScript } from "./appsScript";
import type {
  DashboardData, SubmissionsResponse, StatusResponse, ReportResponse,
  YearEndResponse, BudgetImpactResponse, HealthResponse,
} from "./types";

export function getHealth() {
  return fetchAppsScript<HealthResponse>("health", { revalidate: 30 });
}

export function getDashboard(token: string, fy?: string) {
  return fetchAppsScript<DashboardData>("dashboard", { token, params: { fy }, revalidate: 180, tags: ["dashboard"] });
}

export function getSubmissions(
  token: string,
  opts: {
    page?: number; limit?: number; q?: string; status?: string; type?: string;
    project?: string; from?: string; to?: string; min?: string; max?: string;
    sort?: string; dir?: string; fy?: string;
  }
) {
  return fetchAppsScript<SubmissionsResponse>("submissions", {
    token,
    params: {
      page: opts.page, limit: opts.limit, q: opts.q, status: opts.status, type: opts.type,
      project: opts.project, from: opts.from, to: opts.to, min: opts.min, max: opts.max,
      sort: opts.sort, dir: opts.dir, fy: opts.fy,
    },
    revalidate: 180,
    tags: ["submissions"],
  });
}

export function getReport(token: string, params: Record<string, string | number | undefined>) {
  return fetchAppsScript<ReportResponse>("report", { token, params, revalidate: 180, tags: ["reports"] });
}

export function getYearEnd(token: string) {
  return fetchAppsScript<YearEndResponse>("yearend", { token, revalidate: 180, tags: ["year-end"] });
}

export function getBudgetImpact(token: string, project: string, amount: number) {
  return fetchAppsScript<BudgetImpactResponse>("budgetImpact", { token, params: { project, amount }, revalidate: 60 });
}

/** Self-service lookup: not ISR-cached (§6.1 — short per-email cache lives in Apps Script). */
export function getStatus(email: string, id?: string) {
  return fetchAppsScript<StatusResponse>("status", { params: { email, id }, revalidate: 0 });
}
