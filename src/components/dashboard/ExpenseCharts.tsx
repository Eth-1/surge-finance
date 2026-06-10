"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import type { Charts } from "@/lib/types";
import { formatCAD } from "@/lib/format";
import { useTheme } from "@/components/ThemeProvider";
import { ChartCard } from "./ChartCard";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Paper Ledger data-viz series (ARCHITECTURE §5.4) — muted, earthy; one set per
// theme so charcoal segments never vanish on the dark "ink" background.
// (Data-viz series are the sanctioned exception to the no-hex-in-components rule.)
const PAPER_PALETTE = [
  "#32302F", "#EBCB8B", "#7A8B7F", "#B08968", "#5F6C7B", "#BDC3C7",
  "#8C6D2F", "#A4453D", "#3E5F8A", "#6B6661", "#9C8F7F", "#4A5A50",
];
const INK_PALETTE = [
  "#E8E3D9", "#D9B779", "#9FB0A3", "#C9A887", "#93A3B5", "#8E959C",
  "#E2C794", "#C97F77", "#89A3C4", "#A8A29B", "#BDB2A2", "#8FA396",
];

function readThemeColors() {
  if (typeof window === "undefined") return { text: "#9aa0a6", grid: "rgba(255,255,255,0.08)" };
  const s = getComputedStyle(document.documentElement);
  return {
    text: s.getPropertyValue("--color-text-secondary").trim() || "#9aa0a6",
    grid: s.getPropertyValue("--color-border").trim() || "rgba(255,255,255,0.08)",
  };
}

export function ExpenseCharts({ charts }: { charts: Charts }) {
  const { resolved } = useTheme(); // recompute colours on theme switch
  const c = useMemo(() => readThemeColors(), [resolved]);
  const palette = resolved === "dark" ? INK_PALETTE : PAPER_PALETTE;

  const doughnutOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: { position: "right" as const, labels: { color: c.text, boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx: any) => `${ctx.label}: ${formatCAD(ctx.parsed)}` } },
      },
    }),
    [c]
  );

  const barOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx: any) => formatCAD(ctx.parsed.y) } },
      },
      scales: {
        x: { ticks: { color: c.text }, grid: { color: c.grid } },
        y: { ticks: { color: c.text }, grid: { color: c.grid } },
      },
    }),
    [c]
  );

  const topOpts = useMemo(
    () => ({
      indexAxis: "y" as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const d = charts.topSubmitters[ctx.dataIndex];
              return `${formatCAD(d.value)} · ${d.count} expense(s) · ${formatCAD(d.outstanding)} outstanding`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: c.text }, grid: { color: c.grid } },
        y: { ticks: { color: c.text }, grid: { display: false } },
      },
    }),
    [c, charts.topSubmitters]
  );

  const pie = (pairs: { label: string; value: number }[]) => ({
    labels: pairs.map((p) => p.label),
    datasets: [{ data: pairs.map((p) => p.value), backgroundColor: palette, borderWidth: 0 }],
  });

  const monthly = useMemo(
    () => ({
      labels: charts.monthly.map((p) => p.label),
      datasets: [{ label: "Spend", data: charts.monthly.map((p) => p.value), backgroundColor: palette[0], borderRadius: 2 }],
    }),
    [charts.monthly, palette]
  );

  const top = useMemo(
    () => ({
      labels: charts.topSubmitters.map((p) => p.label),
      datasets: [{ label: "Total", data: charts.topSubmitters.map((p) => p.value), backgroundColor: palette[1], borderRadius: 2 }],
    }),
    [charts.topSubmitters, palette]
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="By Category" hasData={charts.byCategory.length > 0}>
        <Doughnut data={pie(charts.byCategory)} options={doughnutOpts} />
      </ChartCard>
      <ChartCard title="By Project" hasData={charts.byProject.length > 0}>
        <Doughnut data={pie(charts.byProject)} options={doughnutOpts} />
      </ChartCard>
      <ChartCard title="By Funding Source" hasData={charts.byFundingSource.length > 0}>
        <Doughnut data={pie(charts.byFundingSource)} options={doughnutOpts} />
      </ChartCard>
      <ChartCard title="Monthly Breakdown" hasData={charts.monthly.length > 0}>
        <Bar data={monthly} options={barOpts} />
      </ChartCard>
      <ChartCard title="Top Submitters" hasData={charts.topSubmitters.length > 0} height={320}>
        <Bar data={top} options={topOpts} />
      </ChartCard>
    </div>
  );
}
