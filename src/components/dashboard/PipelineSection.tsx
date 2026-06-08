import type { PipelineRow } from "@/lib/types";
import { statusBadgeClass } from "@/lib/format";

/** Bar accent per status badge class (reuses the semantic palette). */
function barColor(status: string): string {
  switch (statusBadgeClass(status)) {
    case "badge-success": return "var(--color-success)";
    case "badge-warning": return "var(--color-warning)";
    case "badge-danger": return "var(--color-danger)";
    case "badge-action": return "var(--color-action)";
    case "badge-info": return "var(--color-info)";
    default: return "var(--color-primary)";
  }
}

/** Reimbursement pipeline rendered as a proportional funnel (§5.14). Zeros shown. */
export function PipelineSection({ pipeline }: { pipeline: PipelineRow[] }) {
  const max = Math.max(1, ...pipeline.map((r) => r.count));

  return (
    <div className="surge-card">
      <p className="section-title mb-3">Reimbursement Pipeline</p>
      <ul className="space-y-2.5">
        {pipeline.map((row) => {
          const pct = Math.round((row.count / max) * 100);
          return (
            <li key={row.status}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-text">{row.status}</span>
                <span className="muted shrink-0 tabular-nums">
                  {row.count} · {row.totalDisplay}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-2 rounded-full transition-[width] duration-500"
                  style={{ width: `${row.count === 0 ? 0 : Math.max(pct, 4)}%`, background: barColor(row.status) }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
