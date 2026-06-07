import type { ReportResponse } from "@/lib/types";
import { formatCAD } from "@/lib/format";
import { StatusBadge } from "@/components/ui/Badge";
import { PrintButton } from "./PrintButton";
import { ByStatusTable } from "./ByStatusTable";
import { ExportReportButton } from "./ExportReportButton";

/** Renders a generated report: summary + category bars + status table + grant info. */
export function ReportViewer({ report }: { report: ReportResponse }) {
  const s = report.summary;
  const max = Math.max(1, ...s.byCategory.map((c) => c.value));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{report.filter}</h2>
          <p className="muted text-sm">
            {s.totalDisplay} · {s.count} expense{s.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportReportButton report={report} />
          <PrintButton />
        </div>
      </div>

      {report.grant && (
        <div className="surge-card grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div><span className="section-title">Requested</span><p className="mt-1">{formatCAD(report.grant.requested)}</p></div>
          <div><span className="section-title">Approved</span><p className="mt-1">{formatCAD(report.grant.approved)}</p></div>
          <div><span className="section-title">Spent</span><p className="mt-1">{formatCAD(report.grant.spent)}</p></div>
          <div><span className="section-title">Remaining</span><p className="mt-1">{formatCAD(report.grant.remaining)}</p></div>
          <div><span className="section-title">Utilization</span><p className="mt-1">{report.grant.utilization}</p></div>
          <div><span className="section-title">Status</span><p className="mt-1"><StatusBadge status={report.grant.status} /></p></div>
        </div>
      )}

      <div className="surge-card">
        <p className="section-title mb-3">By Category</p>
        {s.byCategory.length === 0 ? (
          <p className="muted text-sm">No expenses in this report.</p>
        ) : (
          <ul className="space-y-2">
            {s.byCategory.map((c) => (
              <li key={c.label} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span>{c.label}</span>
                  <span className="font-medium">{formatCAD(c.value)}</span>
                </div>
                <div className="h-2 w-full rounded bg-surface-3">
                  <div className="h-2 rounded bg-primary" style={{ width: `${(c.value / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surge-card">
        <p className="section-title mb-3">By Status</p>
        <ByStatusTable rows={s.byStatus} />
      </div>
    </div>
  );
}
