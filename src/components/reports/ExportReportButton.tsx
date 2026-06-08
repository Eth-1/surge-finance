"use client";

import { Download } from "lucide-react";
import type { ReportResponse } from "@/lib/types";
import { toCsv, downloadCsv } from "@/lib/csv";

/** Export the generated report summary to CSV (B-2). Client-side, no server cost. */
export function ExportReportButton({ report }: { report: ReportResponse }) {
  function exportCsv() {
    const s = report.summary;
    const head = toCsv(["Report", "Total", "Count"], [[report.filter, s.total, s.count]]);
    const cat = toCsv(["Category", "Amount"], s.byCategory.map((c) => [c.label, c.value]));
    const st = toCsv(["Status", "Count", "Total"], s.byStatus.map((r) => [r.status, r.count, r.total]));
    const csv = `${head}\r\n\r\nBy Category\r\n${cat}\r\n\r\nBy Status\r\n${st}`;
    downloadCsv(`report-${report.type}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }
  return (
    <button className="btn btn-ghost no-print gap-1.5" onClick={exportCsv}><Download size={15} /> Export CSV</button>
  );
}
