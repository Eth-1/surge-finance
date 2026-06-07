"use client";

import { useEffect, useMemo, useState } from "react";
import type { StatusRecord } from "@/lib/types";
import { StatusRecordCard } from "@/components/StatusRecordCard";
import { statusBucket, type StatusBucket } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";

type Filter = "all" | StatusBucket;
type SortKey = "newest" | "oldest" | "amount-desc" | "amount-asc" | "status";

const CHIPS: { key: Filter; label: string; color: string }[] = [
  { key: "all", label: "Total Submitted", color: "var(--color-primary)" },
  { key: "pending", label: "Pending", color: "var(--color-warning)" },
  { key: "approved", label: "Approved", color: "var(--color-info)" },
  { key: "reimbursed", label: "Reimbursed", color: "var(--color-success)" },
  { key: "rejected", label: "Rejected", color: "var(--color-danger)" },
];

function money(n: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

export function StatusResults({
  records,
  requestedId,
  email,
}: {
  records: StatusRecord[];
  requestedId: string;
  email: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  useEffect(() => {
    if (requestedId) {
      const el = document.getElementById(`rec-${requestedId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [requestedId]);

  // Per-bucket count + total for the summary chips.
  const stats = useMemo(() => {
    const s: Record<Filter, { count: number; amount: number }> = {
      all: { count: 0, amount: 0 }, pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 }, reimbursed: { count: 0, amount: 0 }, rejected: { count: 0, amount: 0 },
    };
    for (const r of records) {
      const b = statusBucket(r.status);
      s.all.count++; s.all.amount += r.amount;
      s[b].count++; s[b].amount += r.amount;
    }
    return s;
  }, [records]);

  const visible = useMemo(() => {
    const list = filter === "all" ? records : records.filter((r) => statusBucket(r.status) === filter);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest": return a.submittedTs - b.submittedTs;
        case "amount-desc": return b.amount - a.amount;
        case "amount-asc": return a.amount - b.amount;
        case "status": return a.status.localeCompare(b.status);
        default: return b.submittedTs - a.submittedTs; // newest
      }
    });
    return sorted;
  }, [records, filter, sort]);

  function exportCsv() {
    const headers = ["Type", "Vendor", "Event", "Amount", "Status", "Purchase Date", "Submitted On", "CR Number", "Payment Date", "Payment Method"];
    const rows = visible.map((r) => [
      r.type, r.vendor, r.event, r.amount, r.status, r.date, r.submitted, r.crNumber, r.paymentDate, r.paymentMethod,
    ]);
    downloadCsv(`my-reimbursements-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
  }

  return (
    <section>
      {/* Summary chips — click to filter */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CHIPS.map((c, i) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={"stat-chip animate-in " + (filter === c.key ? "selected" : "")}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="block text-[11px] uppercase tracking-wide text-text-secondary">{c.label}</span>
            <span className="mt-0.5 block text-lg font-semibold tabular-nums" style={{ color: c.color }}>
              {stats[c.key].count}
            </span>
            <span className="block text-[11px] text-text-muted">{money(stats[c.key].amount)}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="muted text-sm">
          {visible.length} {filter === "all" ? "" : filter + " "}result{visible.length === 1 ? "" : "s"} for <strong>{email}</strong>
        </p>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount-desc">Amount (high→low)</option>
            <option value="amount-asc">Amount (low→high)</option>
            <option value="status">Status</option>
          </select>
          <button className="btn btn-ghost py-1 text-sm" onClick={exportCsv} disabled={visible.length === 0}>
            ⬇ Export
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted py-6 text-center text-sm">No {filter === "all" ? "" : filter + " "}submissions to show.</p>
      ) : (
        visible.map((r, i) => (
          <StatusRecordCard key={r.id} record={r} email={email} highlight={r.id === requestedId} index={i} />
        ))
      )}
    </section>
  );
}
