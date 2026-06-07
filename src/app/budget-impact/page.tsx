import { getServerToken } from "@/lib/serverAuth";
import { getBudgetImpact } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { BudgetImpactView } from "@/components/BudgetImpactView";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BudgetImpactResponse } from "@/lib/types";

export const metadata = { title: "Budget Impact — Surge Finance" };

/**
 * Read-only Budget Impact Preview page (§4.5a). Displays the impact for a
 * project + amount; the actual move happens in the Google Sheet.
 */
export default async function BudgetImpactPage({
  searchParams,
}: {
  searchParams: { project?: string; amount?: string };
}) {
  const token = getServerToken();
  if (!token) return <AuthGate area="the budget impact preview" />;

  const project = (searchParams.project || "").trim();
  const amount = parseFloat(searchParams.amount || "0") || 0;

  if (!project) {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState icon="📊" title="Budget Impact Preview" message="Provide a project and amount (e.g. ?project=StormHacks+2026&amount=350)." />
      </div>
    );
  }

  const res = (await getBudgetImpact(token, project, amount)) as BudgetImpactResponse & { error?: string };
  if (res.error === "unauthorized") return <AuthGate area="the budget impact preview" />;

  return (
    <div className="mx-auto max-w-md space-y-3">
      <BudgetImpactView impact={res.impact} project={project} />
      <p className="muted text-center text-xs">
        Read-only preview. Run “Move to Expenses” in the Google Sheet to apply (with a fresh in-lock recheck).
      </p>
    </div>
  );
}
