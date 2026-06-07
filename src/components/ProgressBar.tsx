import type { Progress } from "@/lib/format";

/**
 * Self-service progress bar (§4.4). 8-step CR path or 4-step direct path.
 * Action Required renders at the active step with a 🔧 + "Info Requested"
 * sub-label and amber styling rather than a separate step (X6). Rejected shows
 * a danger indicator instead of progress.
 */
export function ProgressBar({ progress }: { progress: Progress }) {
  if (progress.rejected) {
    return (
      <div className="my-3">
        <span className="badge badge-danger">✕ Rejected</span>
      </div>
    );
  }

  return (
    <div className="my-3 flex items-start gap-1 overflow-x-auto pb-1">
      {progress.steps.map((label, i) => {
        const stepNum = i + 1;
        const isActionStep = progress.actionRequired && stepNum === progress.current;
        const done = stepNum < progress.current;
        const active = stepNum === progress.current;

        const circleClass = isActionStep
          ? "bg-warning text-white"
          : done
          ? "bg-primary text-white"
          : active
          ? "bg-primary text-white ring-2 ring-primary-light"
          : "bg-surface-3 text-text-muted";

        const sublabel = isActionStep ? "Info Requested" : "";

        return (
          <div key={i} className="flex min-w-[64px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || active ? "bg-primary" : "bg-surface-3"}`} />
              <div className={`mx-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${circleClass}`}>
                {isActionStep ? "🔧" : done ? "✓" : stepNum}
              </div>
              <div className={`h-0.5 flex-1 ${i === progress.steps.length - 1 ? "opacity-0" : done ? "bg-primary" : "bg-surface-3"}`} />
            </div>
            <span className="mt-1 whitespace-pre-line text-[10px] leading-tight text-text-secondary">{label}</span>
            {sublabel && <span className="text-[10px] font-semibold text-warning">{sublabel}</span>}
          </div>
        );
      })}
    </div>
  );
}
