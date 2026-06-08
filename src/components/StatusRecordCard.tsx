"use client";

import { useState } from "react";
import { Paperclip, Link2, Check } from "lucide-react";
import type { StatusRecord } from "@/lib/types";
import { getProgress } from "@/lib/format";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ProgressBar";
import { useToast } from "@/components/ui/Toast";

/** Left-accent colour by status for quick scanning. */
function accentFor(status: string): string {
  if (/reject/i.test(status)) return "var(--color-danger)";
  if (status === "Reimbursed") return "var(--color-success)";
  if (status === "Action Required" || status === "Follow Up Required" || status === "Awaiting Payment")
    return "var(--color-warning)";
  return "var(--color-primary)";
}

function Meta({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-sm text-text">{value && value.trim() ? value : "—"}</p>
    </div>
  );
}

export function StatusRecordCard({
  record,
  email,
  highlight = false,
  index = 0,
}: {
  record: StatusRecord;
  email: string;
  highlight?: boolean;
  index?: number;
}) {
  const [copied, setCopied] = useState(false);
  const progress = getProgress(record);
  const { toast } = useToast();

  function copyLink() {
    // Direct share link — includes the email so the recipient isn't re-prompted.
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    params.set("id", record.id);
    const url = `${window.location.origin}/status?${params.toString()}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      toast("Link copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      id={`rec-${record.id}`}
      className="surge-card surge-card-hover animate-in mb-4"
      style={{
        borderLeft: `4px solid ${accentFor(record.status)}`,
        animationDelay: `${Math.min(index, 12) * 40}ms`,
        outline: highlight ? "2px solid var(--color-primary)" : undefined,
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={record.type} />
          <span className="font-medium text-text">{record.vendor || record.event || "Submission"}</span>
        </div>
        <StatusBadge status={record.status} pulse={record.status === "Fully Approved"} />
      </div>

      <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-text">{record.amountDisplay}</span>
        {record.event && <span className="muted text-sm">{record.event}</span>}
      </div>
      {record.description && <p className="muted mb-1 text-sm">{record.description}</p>}

      {record.type === "Mileage" && record.distance != null && (
        <p className="muted text-xs">
          {record.distance} km @ ${Number(record.rateApplied || 0).toFixed(2)}/km
        </p>
      )}

      <ProgressBar progress={progress} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
        <Meta label="Purchase Date" value={record.date} />
        <Meta label="Submitted On" value={record.submitted} />
        <Meta label="CR Number" value={record.crNumber} />
        <Meta label="Payment Date" value={record.paymentDate} />
      </div>

      {record.rejectionReason && (
        <div className="mt-3 rounded-md p-2 text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
          <strong>Rejection reason:</strong> {record.rejectionReason}
        </div>
      )}
      {record.reviewNotes && (
        <div className="mt-3 rounded-md p-2 text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
          <strong>Reviewer notes:</strong> {record.reviewNotes}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {record.receiptUrl ? (
            <a href={record.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <Paperclip size={13} /> View Receipt
            </a>
          ) : (
            <span className="muted inline-flex items-center gap-1"><Paperclip size={13} /> No receipt</span>
          )}
          {record.paymentMethod && <span className="muted">{record.paymentMethod}</span>}
        </div>
        <button onClick={copyLink} className="inline-flex items-center gap-1 text-text-secondary transition-colors hover:text-text" title="Copy a direct link to this record">
          {copied ? <Check size={13} /> : <Link2 size={13} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
