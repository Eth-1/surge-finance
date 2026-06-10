import { HandCoins, PiggyBank, CheckCircle2 } from "lucide-react";
import type { AdvancesSummary, LoansSummary } from "@/lib/types";
import { formatCAD } from "@/lib/format";

/**
 * Liabilities — money the club owes people (ARCHITECTURE §6.3).
 * Two ledgers in one bordered module:
 *  - Owed to treasurer: personal ADVANCES (treasurer paid a member out-of-pocket).
 *  - Owed to members: LOANS (a member funded a club expense).
 * Both clear automatically as their linked CRs distribute / repayments are logged.
 * `loans` is optional so the dashboard renders against pre-V3 Apps Script too.
 */
export function LiabilitiesSection({
  advances,
  loans,
}: {
  advances?: AdvancesSummary;
  loans?: LoansSummary;
}) {
  const advTotal = advances?.outstandingTotal ?? 0;
  const loanTotal = loans?.outstandingTotal ?? 0;
  const total = advTotal + loanTotal;

  return (
    <div className="surge-card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="section-title">Liabilities — owed to people</p>
        {total > 0 && (
          <span className="text-lg font-semibold tabular-nums text-warning">{formatCAD(total)}</span>
        )}
      </div>

      {total <= 0 ? (
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--color-success)" }}>
          <CheckCircle2 size={16} /> No outstanding liabilities.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Advances: club owes the treasurer */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <HandCoins size={14} /> Owed to treasurer
              {advTotal > 0 && <span className="ml-auto tabular-nums normal-case text-text">{formatCAD(advTotal)}</span>}
            </p>
            {advTotal <= 0 ? (
              <p className="muted text-sm">None.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {advances!.byPerson.map((p) => (
                  <li key={p.person} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-text">{p.person}</span>
                    <span className="muted shrink-0 tabular-nums">
                      {p.amountDisplay} · {p.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Loans: club owes members */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <PiggyBank size={14} /> Owed to members
              {loanTotal > 0 && <span className="ml-auto tabular-nums normal-case text-text">{formatCAD(loanTotal)}</span>}
            </p>
            {loanTotal <= 0 ? (
              <p className="muted text-sm">None.</p>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm">
                  {loans!.byLender.map((l) => (
                    <li key={l.lender} className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-text">{l.lender}</span>
                      <span className="muted shrink-0 tabular-nums">
                        {l.amountDisplay} · {l.count}
                      </span>
                    </li>
                  ))}
                </ul>
                {(loans!.overdueCount > 0 || loans!.readyToRepayCount > 0) && (
                  <p className="mt-2 text-xs font-medium text-warning">
                    {loans!.overdueCount > 0 && `${loans!.overdueCount} overdue. `}
                    {loans!.readyToRepayCount > 0 && `${loans!.readyToRepayCount} ready to repay (CR distributed).`}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {total > 0 && (
        <p className="muted mt-3 text-xs">
          Advances clear when their CR distributes; loans clear as repayments are logged in the Loans sheet.
        </p>
      )}
    </div>
  );
}
