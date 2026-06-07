"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Fiscal-year selector for the dashboard (B-1). Generates the last few FY codes
 * (assuming the default May-1 start) and drives `/dashboard?fy=<code>`. The
 * backend resolves the code to the configured FY label.
 */
function fyOptions() {
  const now = new Date();
  const startYear = now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1; // May = month 4
  const opts: { code: string; label: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const s = startYear - i;
    opts.push({ code: String(s).slice(-2) + String(s + 1).slice(-2), label: `FY ${s}–${s + 1}` });
  }
  return opts;
}

export function FySelector() {
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get("fy") || "";
  const opts = fyOptions();

  return (
    <select
      className="input w-auto py-1 text-sm"
      value={current}
      onChange={(e) => router.push(e.target.value ? `/dashboard?fy=${e.target.value}` : "/dashboard")}
      aria-label="Fiscal year"
    >
      <option value="">Current FY</option>
      {opts.map((o) => (
        <option key={o.code} value={o.code}>{o.label}</option>
      ))}
    </select>
  );
}
