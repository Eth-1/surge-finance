"use client";

import { useState } from "react";
import type { StatusRecord } from "@/lib/types";
import { getProgress } from "@/lib/format";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ProgressBar";

export function StatusRecordCard({ record, highlight = false }: { record: StatusRecord; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  const progress = getProgress(record);

  function copyLink() {
    const url = `${window.location.origin}/status?id=${encodeURIComponent(record.id)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      id={`rec-${record.id}`}
      className="surge-card mb-4"
      style={highlight ? { outline: "2px solid var(--color-primary)" } : undefined}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={record.type} />
          <span className="font-medium text-text">{record.vendor || record.event || "Submission"}</span>
        </div>
        <StatusBadge status={record.status} pulse={record.status === "Fully Approved"} />
      </div>

      <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-xl font-semibold text-text">{record.amountDisplay}</span>
        {record.event && <span className="muted">{record.event}</span>}
        {record.date && <span className="muted">📅 {record.date}</span>}
      </div>
      {record.description && <p className="muted mb-1 text-sm">{record.description}</p>}

      {record.type === "Mileage" && (record.distance != null) && (
        <p className="muted text-xs">
          {record.distance} km @ ${Number(record.rateApplied || 0).toFixed(2)}/km
        </p>
      )}

      <ProgressBar progress={progress} />

      {record.rejectionReason && (
        <div className="mt-2 rounded-md border border-danger/30 p-2 text-sm" style={{ background: "rgba(248,113,113,0.1)" }}>
          <strong>Rejection reason:</strong> {record.rejectionReason}
        </div>
      )}
      {record.reviewNotes && (
        <div className="mt-2 rounded-md p-2 text-sm" style={{ background: "rgba(248,113,113,0.1)" }}>
          <strong>Reviewer notes:</strong> {record.reviewNotes}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {record.receiptUrl ? (
            <a href={record.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary">
              📎 View Receipt
            </a>
          ) : (
            <span className="muted">📎 No receipt</span>
          )}
          {record.crNumber && <span className="muted">CR: {record.crNumber}</span>}
          {record.paymentDate && <span className="muted">Paid: {record.paymentDate}</span>}
        </div>
        <button onClick={copyLink} className="text-text-secondary hover:text-text" title="Copy a shareable link to this record">
          {copied ? "✅ Copied" : "🔗 Copy link"}
        </button>
      </div>
    </div>
  );
}
