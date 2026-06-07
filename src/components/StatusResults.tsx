"use client";

import { useEffect } from "react";
import type { StatusRecord } from "@/lib/types";
import { StatusRecordCard } from "@/components/StatusRecordCard";

/**
 * Renders the unified self-service result list. When a deep-link id (S3) is
 * present AND owned by the entered email, that record is highlighted and
 * scrolled into view.
 */
export function StatusResults({
  records,
  requestedId,
  email,
}: {
  records: StatusRecord[];
  requestedId: string;
  email: string;
}) {
  useEffect(() => {
    if (requestedId) {
      const el = document.getElementById(`rec-${requestedId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [requestedId]);

  return (
    <section>
      <p className="muted mb-3 text-sm">
        Showing {records.length} result{records.length === 1 ? "" : "s"} for <strong>{email}</strong>
      </p>
      {records.map((r) => (
        <StatusRecordCard key={r.id} record={r} highlight={r.id === requestedId} />
      ))}
    </section>
  );
}
