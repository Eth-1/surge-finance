import type { SubmissionRecord } from "@/lib/types";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";

/** All-submissions table. Fully Approved badges pulse on render (D2). */
export function SubmissionsTable({ records }: { records: SubmissionRecord[] }) {
  return (
    <div className="surge-card overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-text-secondary">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Vendor</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Project</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Type</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id + r.source} className="border-b last:border-0">
              <td className="px-3 py-2 text-text-muted">{r.date}</td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{r.vendor}</td>
              <td className="px-3 py-2 text-right font-medium">{r.amountDisplay}</td>
              <td className="px-3 py-2 text-text-secondary">{r.project}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} pulse={r.status === "Fully Approved"} />
              </td>
              <td className="px-3 py-2">
                <TypeBadge type={r.type} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
