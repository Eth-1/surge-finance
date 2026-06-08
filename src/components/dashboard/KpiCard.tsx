"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { formatCAD } from "@/lib/format";

export type KpiKind = "currency" | "count" | "percent";

/**
 * Animated KPI counter card with the §4.5g empty state. When value is 0 it
 * renders muted with no animation and a "No data for this period." subtitle.
 */
export function KpiCard({
  label,
  value,
  kind,
  subtitle,
  icon: Icon,
  accent = "var(--color-primary)",
}: {
  label: string;
  value: number;
  kind: KpiKind;
  subtitle?: string;
  icon?: LucideIcon;
  accent?: string;
}) {
  const empty = !value;
  const [shown, setShown] = useState(empty ? value : 0);

  useEffect(() => {
    if (empty) { setShown(value); return; }
    const duration = 800;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, empty]);

  function fmt(n: number) {
    if (kind === "currency") return formatCAD(n);
    if (kind === "percent") return Math.round(n) + "%";
    return Math.round(n).toLocaleString();
  }

  return (
    <div className="surge-card surge-card-hover animate-in">
      <div className="flex items-start justify-between">
        <p className="section-title">{label}</p>
        {Icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2" style={{ color: accent }} aria-hidden>
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className={"mt-2 text-2xl font-semibold tabular-nums tracking-tight " + (empty ? "text-text-muted" : "text-text")}>
        {fmt(shown)}
      </p>
      <p className="muted mt-1 text-xs">{empty ? "No data for this period." : subtitle || " "}</p>
    </div>
  );
}
