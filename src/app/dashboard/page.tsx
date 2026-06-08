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

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-text-secondary">{data.fiscalYear}</span>
          <span className="muted inline-flex items-center gap-1.5">
            <span className="dot-live" /> Updated {relativeTime(data.lastRefresh)}
          </span>
        </div>
        <FySelector />
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
