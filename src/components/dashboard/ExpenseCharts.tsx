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

// 15-colour palette (§3.4, retained) — data-viz series colours, not theme tokens.
const PALETTE = [
  "#6366f1", "#06b6d4", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa",
  "#f472b6", "#fb923c", "#2dd4bf", "#facc15", "#4ade80", "#e879f9", "#38bdf8", "#fca5a5",
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

  const doughnutOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right" as const, labels: { color: c.text, boxWidth: 12, font: { size: 11 } } },
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
    datasets: [{ data: pairs.map((p) => p.value), backgroundColor: PALETTE, borderWidth: 0 }],
  });

  const monthly = useMemo(
    () => ({
      labels: charts.monthly.map((p) => p.label),
      datasets: [{ label: "Spend", data: charts.monthly.map((p) => p.value), backgroundColor: PALETTE[0], borderRadius: 4 }],
    }),
    [charts.monthly]
  );

  const top = useMemo(
    () => ({
      labels: charts.topSubmitters.map((p) => p.label),
      datasets: [{ label: "Total", data: charts.topSubmitters.map((p) => p.value), backgroundColor: PALETTE[1], borderRadius: 4 }],
    }),
    [charts.topSubmitters]
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
