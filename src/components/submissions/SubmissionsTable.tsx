import Link from "next/link";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import type { SubmissionRecord, SubmissionSort, SortDir } from "@/lib/types";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";

const COLUMNS: { key: SubmissionSort; label: string; right?: boolean }[] = [
  { key: "date", label: "Date" },
  { key: "name", label: "Name" },
  { key: "vendor", label: "Vendor" },
  { key: "amount", label: "Amount", right: true },
  { key: "project", label: "Project" },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
];

function defaultDir(key: SubmissionSort): SortDir {
  return key === "date" || key === "amount" ? "desc" : "asc";
}

/** Left-border accent color for at-a-glance status grouping (B-5). */
function rowAccent(status: string): string {
  if (status === "Action Required" || status === "Follow Up Required" || status === "Awaiting Payment")
    return "var(--color-warning)";
  if (status === "Rejected" || status === "Rejected / Cancelled") return "var(--color-text-muted)";
  if (status === "Reimbursed" || status === "Distributed") return "var(--color-success)";
  return "var(--color-primary)";
}

export function SubmissionsTable({
  records,
  sort,
  dir,
  searchParams,
}: {
  records: SubmissionRecord[];
  sort: SubmissionSort;
  dir: SortDir;
  searchParams: Record<string, string | undefined>;
}) {
  function sortHref(key: SubmissionSort): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== "page" && k !== "sort" && k !== "dir") params.set(k, v);
    }
    const nextDir: SortDir = key === sort ? (dir === "asc" ? "desc" : "asc") : defaultDir(key);
    params.set("sort", key);
    params.set("dir", nextDir);
    return `/submissions?${params.toString()}`;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="surge-card hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-text-secondary">
              {COLUMNS.map((c) => {
                const Caret = sort === c.key ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th key={c.key} className={"px-3 py-2.5 font-medium " + (c.right ? "text-right" : "")}>
                    <Link href={sortHref(c.key)} className={"inline-flex items-center gap-1 hover:text-text " + (c.right ? "flex-row-reverse" : "")}>
                      {c.label}
                      <Caret size={13} className={sort === c.key ? "text-primary" : "opacity-50"} />
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr
                key={r.id + r.source}
                className="border-b transition-colors last:border-0 hover:bg-surface-2"
                style={{ borderLeft: `3px solid ${rowAccent(r.status)}` }}
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-text-muted">{r.date}</td>
                <td className="px-3 py-2.5">{r.name}</td>
                <td className="max-w-[180px] truncate px-3 py-2.5" title={r.vendor}>{r.vendor}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{r.amountDisplay}</td>
                <td className="max-w-[160px] truncate px-3 py-2.5 text-text-secondary" title={r.project}>{r.project}</td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} pulse={r.status === "Fully Approved"} /></td>
                <td className="px-3 py-2.5"><TypeBadge type={r.type} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {records.map((r) => (
          <div key={r.id + r.source} className="surge-card animate-in" style={{ borderLeft: `4px solid ${rowAccent(r.status)}`, padding: 14 }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-text">{r.name}</div>
                <div className="muted truncate text-xs">{[r.vendor, r.project].filter(Boolean).join(" · ")}</div>
              </div>
              <StatusBadge status={r.status} pulse={r.status === "Fully Approved"} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-text-muted">{r.date}</span>
              <div className="flex items-center gap-2">
                <TypeBadge type={r.type} />
                <span className="font-semibold tabular-nums text-text">{r.amountDisplay}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
