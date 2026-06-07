import { getServerToken } from "@/lib/serverAuth";
import { getReport, getDashboard } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { ReportControls } from "@/components/reports/ReportControls";
import { ReportViewer } from "@/components/reports/ReportViewer";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ReportResponse, DashboardData } from "@/lib/types";

export const metadata = { title: "Reports — Surge Finance" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { type?: string; month?: string; project?: string; grant?: string; start?: string; end?: string; fy?: string };
}) {
  const token = getServerToken();
  if (!token) return <AuthGate area="reports" />;

  // Option lists for the controls (cached via dashboard ISR tag).
  let projects: string[] = [];
  let fundingSources: string[] = [];
  try {
    const dash = (await getDashboard(token)) as DashboardData & { error?: string };
    if (!dash.error) { projects = dash.lists.projectNames; fundingSources = dash.lists.fundingSources; }
  } catch { /* controls still render with empty option lists */ }

  const type = searchParams.type;
  let report: (ReportResponse & { error?: string }) | null = null;
  if (type) {
    report = (await getReport(token, { ...searchParams })) as ReportResponse & { error?: string };
    if (report.error === "unauthorized") return <AuthGate area="reports" />;
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="muted text-sm">Generate monthly, event, grant, term, or year-end summaries.</p>
      </header>

      <ReportControls projects={projects} fundingSources={fundingSources} />

      {report && !report.error ? (
        <ReportViewer report={report} />
      ) : (
        <EmptyState icon="📑" title="Choose a report type and click Generate." />
      )}
    </div>
  );
}
