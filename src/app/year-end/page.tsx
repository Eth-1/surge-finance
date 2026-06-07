import { getServerToken } from "@/lib/serverAuth";
import { getYearEnd } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import type { YearEndResponse } from "@/lib/types";

export const metadata = { title: "Year-End — Surge Finance" };

export default async function YearEndPage() {
  const token = getServerToken();
  if (!token) return <AuthGate area="the year-end checklist" />;

  const res = (await getYearEnd(token)) as YearEndResponse & { error?: string };
  if (res.error === "unauthorized") return <AuthGate area="the year-end checklist" />;

  const checklist = res.checklist || [];
  const remaining = checklist.filter((i) => !i.ok).length;
  const ready = remaining === 0;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Fiscal Year-End Checklist</h1>
        <p className="muted text-sm">Read-only readiness overview (§4.5b).</p>
      </header>

      <div
        className="surge-card mb-4 text-sm"
        style={{ color: ready ? "var(--color-success)" : "var(--color-warning)" }}
      >
        {ready ? "✅ All items resolved — ready for year-end rollover." : `⚠️ ${remaining} item(s) still need attention before rollover.`}
      </div>

      <ul className="space-y-2">
        {checklist.map((item) => (
          <li key={item.item} className="surge-card flex items-center justify-between gap-3 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span>{item.ok ? "✅" : "⚠️"}</span>
              <span className="text-text">{item.item}</span>
            </div>
            <span className="muted">
              {item.ok ? item.info || "Done" : `${item.count} remaining${item.info ? ` · ${item.info}` : ""}`}
            </span>
          </li>
        ))}
      </ul>

      <p className="muted mt-4 text-xs">
        The rollover &amp; archiving actions run in the Google Sheet (⚡ Surge Finance menu) — this view is read-only.
      </p>
    </div>
  );
}
