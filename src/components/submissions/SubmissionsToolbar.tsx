"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Search + filters for /submissions (§4.5c, F-1, B-2, B-4). URL-param driven.
 * Status/project options come from the live data (C-1). Search/amount are
 * debounced; selects/dates apply immediately. Export streams a CSV of all
 * filtered rows (B-2).
 */
export function SubmissionsToolbar({
  statusOptions,
  projectOptions,
  fyScope,
}: {
  statusOptions: string[];
  projectOptions: string[];
  fyScope: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [min, setMin] = useState(sp.get("min") || "");
  const [max, setMax] = useState(sp.get("max") || "");
  const [showMore, setShowMore] = useState(
    !!(sp.get("project") || sp.get("from") || sp.get("to") || sp.get("min") || sp.get("max"))
  );
  const first = useRef(true);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (value && value !== "All") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`/submissions?${params.toString()}`);
  }

  // Debounce free-text inputs (search + amount range).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => {
      const params = new URLSearchParams(Array.from(sp.entries()));
      q.trim() ? params.set("q", q.trim()) : params.delete("q");
      min.trim() ? params.set("min", min.trim()) : params.delete("min");
      max.trim() ? params.set("max", max.trim()) : params.delete("max");
      params.delete("page");
      router.replace(`/submissions?${params.toString()}`);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, min, max]);

  const exportHref = `/api/submissions/export?${new URLSearchParams(Array.from(sp.entries())).toString()}`;
  const anyFilter =
    !!(sp.get("q") || sp.get("status") || sp.get("type") || sp.get("project") || sp.get("from") || sp.get("to") || sp.get("min") || sp.get("max"));

  return (
    <div className="surge-card mb-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input sm:flex-1"
          placeholder="Search name, vendor, description, ID, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input sm:w-44" value={sp.get("status") || "All"} onChange={(e) => setParam("status", e.target.value)}>
          <option value="All">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input sm:w-36" value={sp.get("type") || "All"} onChange={(e) => setParam("type", e.target.value)}>
          <option value="All">All types</option>
          <option value="Receipt">Receipt</option>
          <option value="Mileage">Mileage</option>
        </select>
        <select className="input sm:w-40" value={sp.get("fy") || ""} onChange={(e) => setParam("fy", e.target.value)}>
          <option value="">{fyScope === "all" ? "Current FY" : fyScope}</option>
          <option value="all">All years</option>
        </select>
        <a href={exportHref} className="btn btn-ghost whitespace-nowrap" download>⬇ Export CSV</a>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <button className="text-primary" onClick={() => setShowMore((v) => !v)}>
          {showMore ? "Hide filters ▲" : "More filters ▼"}
        </button>
        {anyFilter && <Link href="/submissions" className="text-text-secondary hover:text-text">Clear all</Link>}
      </div>

      {showMore && (
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-text-secondary">Project
            <select className="input mt-1" value={sp.get("project") || "All"} onChange={(e) => setParam("project", e.target.value)}>
              <option value="All">All projects</option>
              {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-secondary">From
            <input type="date" className="input mt-1" value={sp.get("from") || ""} onChange={(e) => setParam("from", e.target.value)} />
          </label>
          <label className="text-xs text-text-secondary">To
            <input type="date" className="input mt-1" value={sp.get("to") || ""} onChange={(e) => setParam("to", e.target.value)} />
          </label>
          <label className="text-xs text-text-secondary">Min $
            <input type="number" inputMode="decimal" className="input mt-1" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label className="text-xs text-text-secondary">Max $
            <input type="number" inputMode="decimal" className="input mt-1" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
