import Link from "next/link";
import { getServerToken } from "@/lib/serverAuth";
import { getSubmissions, getDashboard } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { SubmissionsToolbar } from "@/components/submissions/SubmissionsToolbar";
import { SubmissionsTable } from "@/components/submissions/SubmissionsTable";
import { Pagination } from "@/components/submissions/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SubmissionsResponse, DashboardData } from "@/lib/types";

export const metadata = { title: "Submissions — Surge Finance" };

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string; status?: string; type?: string };
}) {
  const token = getServerToken();
  if (!token) return <AuthGate area="all submissions" />;

  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
  const q = (searchParams.q || "").trim();
  const status = searchParams.status || "All";
  const type = searchParams.type || "All";

  const res = (await getSubmissions(token, {
    page, limit: 25, q,
    status: status !== "All" ? status : undefined,
    type: type !== "All" ? type : undefined,
  })) as SubmissionsResponse & { error?: string };
  if (res.error === "unauthorized") return <AuthGate area="all submissions" />;

  // Live status options for the filter (cached via the dashboard ISR tag).
  let statuses: string[] = [];
  try {
    const dash = (await getDashboard(token)) as DashboardData & { error?: string };
    if (!dash.error) statuses = dash.lists.reimbursementStatuses;
  } catch { /* fall back to no status options */ }

  const filtersActive = !!q || status !== "All" || type !== "All";

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">All Submissions</h1>
        <p className="muted text-sm">{res.total} record{res.total === 1 ? "" : "s"}</p>
      </header>

      <SubmissionsToolbar statuses={statuses} />

      {res.records.length === 0 ? (
        filtersActive ? (
          <EmptyState icon="🔍" title="No results match your filters.">
            <Link className="btn btn-ghost" href="/submissions">Clear filters</Link>
          </EmptyState>
        ) : (
          <EmptyState icon="📭" title="No submissions found." />
        )
      ) : (
        <>
          <SubmissionsTable records={res.records} />
          <Pagination page={res.page} totalPages={res.totalPages} searchParams={searchParams} />
        </>
      )}
    </div>
  );
}
