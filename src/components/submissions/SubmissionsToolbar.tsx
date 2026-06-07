"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Search + status/type filters for /submissions (§4.5c). URL-param driven so
 * the view is shareable/bookmarkable; search is debounced 300ms; filters reset
 * pagination to page 1.
 */
export function SubmissionsToolbar({ statuses }: { statuses: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const firstRender = useRef(true);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (value && value !== "All") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`/submissions?${params.toString()}`);
  }

  // Debounced search.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = setTimeout(() => setParam("q", q.trim()), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="surge-card mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        className="input sm:flex-1"
        placeholder="Search name, vendor, description, ID, email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select className="input sm:w-48" value={sp.get("status") || "All"} onChange={(e) => setParam("status", e.target.value)}>
        <option value="All">All statuses</option>
        {statuses.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select className="input sm:w-40" value={sp.get("type") || "All"} onChange={(e) => setParam("type", e.target.value)}>
        <option value="All">All types</option>
        <option value="Receipt">Receipt</option>
        <option value="Mileage">Mileage</option>
      </select>
    </div>
  );
}
