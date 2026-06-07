import Link from "next/link";
import { getServerToken } from "@/lib/serverAuth";
import { getSubmissions } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { SubmissionsToolbar } from "@/components/submissions/SubmissionsToolbar";
import { SubmissionsTable } from "@/components/submissions/SubmissionsTable";
import { Pagination } from "@/components/submissions/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SubmissionsResponse } from "@/lib/types";

export const metadata = { title: "Submissions — Surge Finance" };

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const token = getServerToken();
  if (!token) return <AuthGate area="all submissions" />;

  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);

  const res = (await getSubmissions(token, {
    page,
    limit: 25,
    q: searchParams.q,
    status: searchParams.status,
    type: searchParams.type,
    project: searchParams.project,
    from: searchParams.from,
    to: searchParams.to,
    min: searchParams.min,
    max: searchParams.max,
    sort: searchParams.sort,
    dir: searchParams.dir,
    fy: searchParams.fy,
  })) as SubmissionsResponse & { error?: string };
  if (res.error === "unauthorized") return <AuthGate area="all submissions" />;

  const filtersActive = !!(
    searchParams.q || searchParams.status || searchParams.type ||
    searchParams.project || searchParams.from || searchParams.to || searchParams.min || searchParams.max
  );

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">All Submissions</h1>
        <p className="muted text-sm">
          {res.total} record{res.total === 1 ? "" : "s"} · {res.fyScope === "all" ? "all years" : res.fyScope}
        </p>
      </header>

      <SubmissionsToolbar
        statusOptions={res.statusOptions || []}
        projectOptions={res.projectOptions || []}
        fyScope={res.fyScope}
      />

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
          <SubmissionsTable records={res.records} sort={res.sort} dir={res.dir} searchParams={searchParams} />
          <Pagination page={res.page} totalPages={res.totalPages} searchParams={searchParams} />
        </>
      )}
    </div>
  );
}
