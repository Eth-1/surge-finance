"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Smart auto-refresh (B4 / §4.5f). Every 300s polls the dashboard checksum; if
 * it differs from what's rendered, shows a non-blocking bottom toast instead of
 * silently swapping data. The user clicks "Refresh now" to re-render — no
 * disorienting layout shift while reading.
 */
export function AutoRefresh({
  initialChecksum,
  children,
}: {
  initialChecksum: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/dashboard-checksum", { cache: "no-store" });
        const json = await res.json();
        if (json.checksum && json.checksum !== initialChecksum) setUpdated(true);
      } catch {
        /* connection dot conveys liveness; ignore transient failures */
      }
    }, 300000);
    return () => clearInterval(id);
  }, [initialChecksum]);

  function refresh() {
    setUpdated(false);
    router.refresh();
  }

  return (
    <>
      {children}
      {updated && (
        <div className="no-print fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="glass flex items-center gap-3 rounded-lg px-4 py-2 text-sm shadow-md">
            <span>📊 Dashboard data updated</span>
            <button className="btn btn-primary px-3 py-1" onClick={refresh}>
              Refresh now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
