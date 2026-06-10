import { CheckCircle2, AlertCircle, PartyPopper } from "lucide-react";
import { getServerToken } from "@/lib/serverAuth";
import { getYearEnd } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import type { YearEndResponse } from "@/lib/types";

export const metadata = { title: "Year-End" };

export default async function YearEndPage() {
  const token = getServerToken();
  if (!token) return <AuthGate area="the year-end checklist" />;

  const res = (await getYearEnd(token)) as YearEndResponse & { error?: string };
  if (res.error === "unauthorized") return <AuthGate area="the year-end checklist" />;

  const checklist = res.checklist || [];
  const done = checklist.filter((i) => i.ok).length;
  const total = checklist.length;
  const remaining = total - done;
  const ready = remaining === 0 && total > 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4">
        <p className="muted text-sm">Read-only readiness overview — close out the fiscal year.</p>
      </header>

      {/* Readiness summary with progress */}
      <div className="surge-card mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium" style={{ color: ready ? "var(--color-success)" : "var(--color-text)" }}>
            {ready ? <PartyPopper size={18} /> : <AlertCircle size={18} className="text-warning" />}
            {ready ? "Ready for year-end rollover" : `${remaining} item${remaining === 1 ? "" : "s"} still need attention`}
          </span>
          <span className="text-sm font-semibold tabular-nums text-text-secondary">{done}/{total}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-2 rounded-full bg-primary-strong transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="space-y-2">
        {checklist.map((item, i) => (
          <li
            key={item.item}
            className="surge-card animate-in flex items-center justify-between gap-3 py-3 text-sm"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <div className="flex items-center gap-2.5">
              {item.ok ? (
                <CheckCircle2 size={18} className="shrink-0 text-success" />
              ) : (
                <AlertCircle size={18} className="shrink-0 text-warning" />
              )}
              <span className="text-text">{item.item}</span>
            </div>
            <span className="muted shrink-0 text-right">
              {item.ok ? item.info || "Done" : `${item.count} remaining${item.info ? ` · ${item.info}` : ""}`}
            </span>
          </li>
        ))}
      </ul>

      <p className="muted mt-4 text-xs">
        Rollover &amp; archiving run in the Google Sheet (⚡ Surge Finance menu) — this view is read-only.
      </p>
    </div>
  );
}
