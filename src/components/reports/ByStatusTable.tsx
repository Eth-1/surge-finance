"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";

type Row = { status: string; count: number; total: number; totalDisplay: string };
type Key = "status" | "count" | "total";

/** Client-sortable "By Status" table for reports (F-2). */
export function ByStatusTable({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<Key>("total");
  const [dir, setDir] = useState<1 | -1>(-1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const ka = sort === "status" ? a.status.toLowerCase() : a[sort];
      const kb = sort === "status" ? b.status.toLowerCase() : b[sort];
      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return 0;
    });
    return copy;
  }, [rows, sort, dir]);

  function header(key: Key, label: string, right = false) {
    const active = sort === key;
    return (
      <th className={"py-1 font-medium " + (right ? "text-right" : "")}>
        <button
          className="inline-flex items-center gap-1 hover:text-text"
          onClick={() => (active ? setDir((d) => (d === 1 ? -1 : 1)) : (setSort(key), setDir(key === "status" ? 1 : -1)))}
        >
          {label}
          <span className="text-[10px] opacity-70">{active ? (dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b text-text-secondary">
          {header("status", "Status")}
          {header("count", "Count", true)}
          {header("total", "Total", true)}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.status} className="border-b last:border-0">
            <td className="py-1.5"><StatusBadge status={row.status} /></td>
            <td className="py-1.5 text-right tabular-nums">{row.count}</td>
            <td className="py-1.5 text-right font-medium tabular-nums">{row.totalDisplay}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
