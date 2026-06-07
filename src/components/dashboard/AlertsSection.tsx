"use client";

import { useState } from "react";
import type { Alert } from "@/lib/types";

const ICON: Record<string, string> = { critical: "🔴", warning: "🟡", info: "ℹ️" };
const COLOR: Record<string, string> = {
  critical: "var(--color-danger)",
  warning: "var(--color-warning)",
  info: "var(--color-info)",
};

/** Alerts capped at 5 with an expandable "Show all X" footer (§4.5e). */
export function AlertsSection({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? alerts : alerts.slice(0, 5);

  return (
    <div className="surge-card">
      <p className="section-title mb-3">Alerts {alerts.length > 0 && <span className="muted">({alerts.length})</span>}</p>

      {alerts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-success)" }}>No alerts — everything looks good! ✅</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: COLOR[a.severity] }}>
              <span>{ICON[a.severity]}</span>
              <span className="text-text">{a.message}</span>
            </li>
          ))}
        </ul>
      )}

      {alerts.length > 5 && (
        <button className="mt-3 text-sm text-primary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less ▲" : `Show all ${alerts.length} alerts ▼`}
        </button>
      )}
    </div>
  );
}
