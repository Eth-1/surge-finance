import type { KPIs } from "@/lib/types";
import { KpiCard } from "./KpiCard";

/** The 4 dashboard KPI cards (§3.5 / §5.14). */
export function KPICards({ kpis }: { kpis: KPIs }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard label="Total Expenses" value={kpis.totalExpenses} kind="currency" />
      <KpiCard label="Outstanding Reimbursements" value={kpis.outstanding} kind="currency" />
      <KpiCard label="Active CRs" value={kpis.activeCRs} kind="count" />
      <KpiCard
        label="Avg Grant Utilization"
        value={kpis.avgGrantUtilization}
        kind="percent"
        subtitle={`${kpis.totalGrants} grant${kpis.totalGrants === 1 ? "" : "s"}`}
      />
    </div>
  );
}
