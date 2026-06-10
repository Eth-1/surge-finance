import type { Progress } from "@/lib/format";

/**
 * Self-service progress stepper (§4.4). 8-step CR path or 4-step direct path.
 * Action Required renders at the active step with a 🔧 + "Info Requested"
 * sub-label (X6). Rejected shows a danger banner.
 *
 * The wrapper scrolls horizontally (min-w-max) with top padding so the active
 * step's glow ring is never clipped (previous overflow-y clipping bug).
 */
export function ProgressBar({ progress }: { progress: Progress }) {
  if (progress.rejected) {
    return (
      <div className="callout-danger my-3 flex items-center gap-2 px-3 py-2 text-sm" style={{ color: "var(--color-danger)" }}>
        <span>✕</span><span className="font-medium">Rejected</span>
      </div>
    );
  }

  return (
    <div className="my-3 overflow-x-auto">
      <div className="flex min-w-max items-start gap-0 px-1 pt-3 pb-1">
        {progress.steps.map((label, i) => {
          const stepNum = i + 1;
          const isAction = progress.actionRequired && stepNum === progress.current;
          const done = stepNum < progress.current;
          const active = stepNum === progress.current;
          const stepClass = isAction ? "action" : done ? "done" : active ? "active" : "todo";

          return (
            <div key={i} className="flex w-[58px] flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div className={`surge-connector ${i === 0 ? "opacity-0" : done || active ? "filled" : "empty"}`} />
                <div className={`surge-step mx-1 ${stepClass} ${active ? "animate-pop" : ""}`}>
                  {isAction ? "🔧" : done ? "✓" : stepNum}
                </div>
                <div className={`surge-connector ${i === progress.steps.length - 1 ? "opacity-0" : done ? "filled" : "empty"}`} />
              </div>
              <span
                className={
                  "mt-1.5 whitespace-pre-line text-[10px] leading-tight " +
                  (active ? "font-semibold text-text" : "text-text-secondary")
                }
              >
                {label}
              </span>
              {isAction && <span className="text-[10px] font-semibold text-warning">Info Requested</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
