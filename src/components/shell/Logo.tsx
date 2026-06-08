import { Zap } from "lucide-react";

/** Surge wordmark — a gradient bolt tile + name. `wordmark={false}` for icon-only. */
export function Logo({ wordmark = true, size = 28 }: { wordmark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="grid place-items-center rounded-lg bg-brand-gradient text-white shadow-sm"
        style={{ height: size, width: size }}
        aria-hidden="true"
      >
        <Zap size={Math.round(size * 0.55)} strokeWidth={2.5} fill="currentColor" />
      </span>
      {wordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-text">
          Surge<span className="font-normal text-text-muted"> Finance</span>
        </span>
      )}
    </span>
  );
}
