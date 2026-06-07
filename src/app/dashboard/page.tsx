import { getServerToken } from "@/lib/serverAuth";
import { getDashboard } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { HealthBanner } from "@/components/HealthBanner";
import { SectionBoundary } from "@/components/SectionBoundary";
import { KPICards } from "@/components/dashboard/KPICards";
import { ExpenseCharts } from "@/components/dashboard/ExpenseCharts";
import { AlertsSection } from "@/components/dashboard/AlertsSection";
import { PipelineSection } from "@/components/dashboard/PipelineSection";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { FySelector } from "@/components/dashboard/FySelector";
import { AdvancesSection } from "@/components/dashboard/AdvancesSection";
import { relativeTime } from "@/lib/format";
import { dashboardChecksum } from "@/lib/checksum";
import type { DashboardData } from "@/lib/types";

export const metadata = { title: "Dashboard — Surge Finance" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { fy?: string };
}) {
  const token = getServerToken();
  if (!token) return <AuthGate area="the dashboard" />;

  const fy = searchParams?.fy || "";
  const data = (await getDashboard(token, fy)) as DashboardData & { error?: string };
  if (data.error === "unauthorized") return <AuthGate area="the dashboard" />;

  return (
    <AutoRefresh initialChecksum={dashboardChecksum(data)} fy={fy}>
    <div className="space-y-6">
      <HealthBanner />

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Finance Dashboard</h1>
          <p className="muted text-sm">{data.fiscalYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <FySelector />
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="dot-live" />
            <span>Updated {relativeTime(data.lastRefresh)}</span>
          </div>
        </div>
      </header>

      <SectionBoundary label="KPIs">
        <KPICards kpis={data.kpis} />
      </SectionBoundary>

      <SectionBoundary label="alerts">
        <AlertsSection alerts={data.alerts} />
      </SectionBoundary>

      <SectionBoundary label="charts">
        <ExpenseCharts charts={data.charts} />
      </SectionBoundary>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionBoundary label="pipeline">
          <PipelineSection pipeline={data.pipeline} />
        </SectionBoundary>
        <SectionBoundary label="activity">
          <ActivityFeed activity={data.activity} />
        </SectionBoundary>
      </div>

      <SectionBoundary label="advances">
        <AdvancesSection advances={data.advances} />
      </SectionBoundary>

    </div>
    </AutoRefresh>
  );
}
