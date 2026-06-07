"use client";

import { useEffect, useState } from "react";
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
}: {
  label: string;
  value: number;
  kind: KpiKind;
  subtitle?: string;
}) {
  const empty = !value;
  const [shown, setShown] = useState(empty ? value : 0);

  useEffect(() => {
    if (empty) {
      setShown(value);
      return;
    }
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
    <div className="surge-card surge-card-hover">
      <p className="section-title">{label}</p>
      <p className={"mt-2 text-2xl font-semibold " + (empty ? "text-text-muted" : "text-text")}>{fmt(shown)}</p>
      <p className="muted mt-1 text-xs">{empty ? "No data for this period." : subtitle || " "}</p>
    </div>
  );
}
