import { HandCoins } from "lucide-react";
import type { AdvancesSummary } from "@/lib/types";

/**
 * E-1 — Outstanding personal advances: money a treasurer fronted to members
 * before SFSS repaid the club. Auto-clears when the linked CR is distributed.
 */
export function AdvancesSection({ advances }: { advances: AdvancesSummary }) {
  const total = advances?.outstandingTotal || 0;

  return (
    <div className="surge-card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="section-title flex items-center gap-1.5"><HandCoins size={14} /> Personal Advances (owed back)</p>
        {total > 0 && <span className="font-semibold tabular-nums text-warning">{advances.outstandingTotalDisplay}</span>}
      </div>

      {total <= 0 ? (
        <p className="text-sm" style={{ color: "var(--color-success)" }}>No outstanding personal advances ✅</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {advances.byPerson.map((p) => (
            <li key={p.person} className="flex items-center justify-between">
              <span className="text-text">{p.person}</span>
              <span className="muted">
                {p.amountDisplay} · {p.count} item{p.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
          <li className="muted pt-1 text-xs">Clears automatically once the linked CR is distributed by SFSS.</li>
        </ul>
      )}
    </div>
  );
}
