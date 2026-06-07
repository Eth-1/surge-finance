"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Connection monitor (C4 / §6.1). Calls /api/health on mount; if it fails, a
 * persistent banner appears ("displaying cached data") with a Retry button.
 * The banner disappears once the health check succeeds again.
 */
export function HealthBanner() {
  const [down, setDown] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = await res.json();
      setDown(!res.ok || data.status !== "ok");
    } catch {
      setDown(true);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (!down) return null;

  return (
    <div
      className="no-print mb-4 flex items-center justify-between rounded-md px-4 py-2 text-sm"
      style={{ background: "rgba(248,113,113,0.12)", color: "var(--color-danger)" }}
    >
      <span>⚠️ Unable to connect to data source — displaying cached data.</span>
      <button className="btn btn-ghost px-3 py-1" onClick={check}>
        Retry
      </button>
    </div>
  );
}
