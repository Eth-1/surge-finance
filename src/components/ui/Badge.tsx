import { statusBadgeClass } from "@/lib/format";
import type { ExpenseType } from "@/lib/types";

/** Status pill (§4.2). `pulse` adds the D2 single-cycle attention pulse. */
export function StatusBadge({ status, pulse = false }: { status: string; pulse?: boolean }) {
  return <span className={`badge ${statusBadgeClass(status)} ${pulse ? "pulse-once" : ""}`}>{status}</span>;
}

/** Receipt / Mileage type badge (§3.10). */
export function TypeBadge({ type }: { type: ExpenseType }) {
  return (
    <span className={`badge ${type === "Mileage" ? "badge-info" : "badge-neutral"}`}>
      {type === "Mileage" ? "🚗 Mileage" : "🧾 Receipt"}
    </span>
  );
}
