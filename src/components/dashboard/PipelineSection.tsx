import type { PipelineRow } from "@/lib/types";
import { StatusBadge } from "@/components/ui/Badge";

/** Reimbursement pipeline — every status with count + total (§5.14). Zeros shown. */
export function PipelineSection({ pipeline }: { pipeline: PipelineRow[] }) {
  return (
    <div className="surge-card">
      <p className="section-title mb-3">Reimbursement Pipeline</p>
      <ul className="space-y-2">
        {pipeline.map((row) => (
          <li key={row.status} className="flex items-center justify-between gap-2 text-sm">
            <StatusBadge status={row.status} />
            <span className="muted">
              {row.count} item{row.count === 1 ? "" : "s"} · {row.totalDisplay}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
