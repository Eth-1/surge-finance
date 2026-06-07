import type { BudgetImpact } from "@/lib/types";
import { formatCAD } from "@/lib/format";

/**
 * Read-only Budget Impact Preview (§4.5a). The Vercel app only DISPLAYS the
 * pre-fetched impact — the authoritative confirm/move (with the F4 in-lock
 * recompute) happens in the Google Sheet, never from here.
 */
export function BudgetImpactView({ impact, project }: { impact: BudgetImpact; project: string }) {
  if (!impact.hasBudget) {
    return (
      <div className="surge-card">
        <h2 className="mb-1 font-semibold">{project}</h2>
        <p className="muted text-sm">No budget allocated for this project.</p>
      </div>
    );
  }

  const warn = (impact.afterUtil ?? 0) >= 75; // default budget warning threshold (§5.8)

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between py-0.5">
      <span className="text-text-secondary">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );

  return (
    <div className="surge-card">
      <h2 className="mb-1 font-semibold">{project}</h2>
      <p className="muted mb-3 text-sm">Expense: {formatCAD(impact.addAmount)}</p>

      <p className="section-title mb-1">Current budget</p>
      <div className="mb-3 rounded-md bg-surface-2 p-3 text-sm">
        <Row k="Allocated" v={formatCAD(impact.allocated)} />
        <Row k="Spent" v={formatCAD(impact.spent)} />
        <Row k="Committed" v={formatCAD(impact.committed)} />
        <Row k="Remaining" v={formatCAD(impact.remaining)} />
        <Row k="Utilization" v={`${impact.util}%`} />
      </div>

      <p className="section-title mb-1">After this approval</p>
      <div className="rounded-md bg-surface-2 p-3 text-sm">
        <Row k="Spent" v={`${formatCAD(impact.afterSpent)} (+${formatCAD(impact.addAmount)})`} />
        <Row k="Remaining" v={formatCAD(impact.afterRemaining)} />
        <Row k="Utilization" v={`${impact.afterUtil}%${warn ? " ⚠️" : ""}`} />
      </div>
    </div>
  );
}
