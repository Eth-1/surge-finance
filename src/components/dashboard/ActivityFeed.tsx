import type { ActivityEntry } from "@/lib/types";

/** Audit-log action → dot color (§3.7). */
function dotColor(action: string): string {
  switch (action) {
    case "APPROVAL":
    case "MOVE_TO_EXPENSES":
    case "CR_CREATED":
      return "var(--color-success)";
    case "REJECTION":
    case "CR_CANCELLED":
    case "ROW_DELETED":
    case "ERROR":
    case "FILE_ERROR":
      return "var(--color-danger)";
    case "FORM_SUBMISSION":
      return "var(--color-accent)";
    default:
      return "var(--color-info)";
  }
}

/** Recent activity feed (15 entries, §5.16). */
export function ActivityFeed({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div className="surge-card">
      <p className="section-title mb-3">Recent Activity</p>
      {activity.length === 0 ? (
        <p className="muted text-sm">No recent activity.</p>
      ) : (
        <ul className="space-y-3">
          {activity.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(e.action) }} />
              <div className="min-w-0">
                <p className="truncate text-text">
                  <span className="font-medium">{e.action.replace(/_/g, " ")}</span>
                  {e.recordId && <span className="muted"> · {e.recordId}</span>}
                </p>
                {e.detail && <p className="muted truncate text-xs">{e.detail}</p>}
                <p className="text-xs text-text-muted">
                  {e.timestamp}
                  {e.user && ` · ${e.user}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
