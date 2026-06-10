/** Shared TypeScript types mirroring the Apps Script Web App JSON contract. */

export type Severity = "critical" | "warning" | "info";
export type ExpenseType = "Receipt" | "Mileage";
export type BadgeClass =
  | "badge-success" | "badge-warning" | "badge-danger" | "badge-info" | "badge-neutral" | "badge-action";

export interface KPIs {
  totalExpenses: number;
  totalExpensesDisplay: string;
  outstanding: number;
  outstandingDisplay: string;
  activeCRs: number;
  totalGrants: number;
  avgGrantUtilization: number;
}

export interface ChartPair { label: string; value: number; }
export interface TopSubmitter { label: string; value: number; count: number; outstanding: number; }

export interface Charts {
  byCategory: ChartPair[];
  byProject: ChartPair[];
  byFundingSource: ChartPair[];
  monthly: ChartPair[];
  topSubmitters: TopSubmitter[];
}

export interface PipelineRow { status: string; count: number; total: number; totalDisplay: string; }
export interface Alert { severity: Severity; message: string; }
export interface ActivityEntry { timestamp: string; user: string; action: string; recordId: string; detail: string; sheet: string; }

export interface ReconciliationSummary {
  totalCRs: number; crsReceived: number; crsDistributed: number; crsPending: number;
  totalExpected: number; totalReceived: number; unreimbursedTotal: number; unreimbursedCount: number;
}

export interface Lists {
  reimbursementStatuses: string[];
  projectNames: string[];
  expenseCategories: string[];
  fundingSources: string[];
  selfServiceVisibleFields: string[];
}

export interface AdvancePerson { person: string; amount: number; amountDisplay: string; count: number; }
export interface AdvancesSummary {
  outstandingTotal: number;
  outstandingTotalDisplay: string;
  count: number;
  byPerson: AdvancePerson[];
}

export interface LoanLender { lender: string; amount: number; amountDisplay: string; count: number; }
/** V3 — member loans to the club (additive; absent until the Apps Script update). */
export interface LoansSummary {
  outstandingTotal: number;
  outstandingTotalDisplay: string;
  count: number;
  overdueCount: number;
  readyToRepayCount: number;
  byLender: LoanLender[];
}

export interface DashboardData {
  ok: boolean;
  fiscalYear: string;
  lastRefresh: string;
  kpis: KPIs;
  charts: Charts;
  pipeline: PipelineRow[];
  alerts: Alert[];
  activity: ActivityEntry[];
  reconciliation: ReconciliationSummary;
  readyToMoveCount: number;
  advances: AdvancesSummary;
  loans?: LoansSummary;   // optional: older GAS deployments don't return it
  lists: Lists;
}

export interface SubmissionRecord {
  id: string; type: ExpenseType; name: string; email: string; vendor: string; description: string;
  amount: number; amountDisplay: string; status: string; project: string; crNumber: string;
  date: string; dateTs: number; source: string;
}
export type SortDir = "asc" | "desc";
export type SubmissionSort = "date" | "name" | "vendor" | "amount" | "project" | "status" | "type";

export interface SubmissionsResponse {
  ok: boolean; page: number; limit: number; total: number; totalPages: number; records: SubmissionRecord[];
  sort: SubmissionSort; dir: SortDir; fyScope: string;
  statusOptions: string[]; projectOptions: string[];
}

export interface StatusRecord {
  id: string; type: ExpenseType; name: string; event: string; vendor: string; description: string;
  amount: number; amountDisplay: string; status: string; date: string; submitted: string; submittedTs: number;
  crNumber: string; paymentDate: string; paymentMethod: string; receiptUrl: string;
  distance?: number; rateApplied?: number; rejectionReason?: string; reviewNotes?: string;
}
export interface StatusResponse {
  ok?: boolean; email?: string; records?: StatusRecord[]; requestedId?: string;
  disabled?: boolean; error?: string;
}

export interface ReportSummary {
  total: number; totalDisplay: string; count: number;
  byCategory: ChartPair[];
  byStatus: { status: string; count: number; total: number; totalDisplay: string }[];
}
export interface GrantInfo {
  name: string; requested: number; approved: number; appealApproved: number;
  spent: number; remaining: number; utilization: string; status: string;
}
export interface ReportResponse { ok: boolean; type: string; filter: string; summary: ReportSummary; grant?: GrantInfo | null; }

export interface YearEndItem { item: string; count: number; ok: boolean; info?: string; }
export interface YearEndResponse { ok: boolean; checklist: YearEndItem[]; }

export interface BudgetImpact {
  hasBudget: boolean; addAmount: number;
  allocated?: number; spent?: number; committed?: number; remaining?: number; util?: number;
  afterSpent?: number; afterRemaining?: number; afterUtil?: number;
}
export interface BudgetImpactResponse { ok: boolean; impact: BudgetImpact; }

export interface HealthResponse { status: string; lastRefresh: string; sheetId: string; version: string; }
