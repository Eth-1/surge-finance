import { Zap } from "lucide-react";

/** Surge wordmark — a gradient bolt tile + name. `wordmark={false}` for icon-only. */
export function Logo({ wordmark = true, size = 28 }: { wordmark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="grid place-items-center rounded-md bg-primary-strong text-on-primary"
        style={{ height: size, width: size }}
        aria-hidden="true"
      >
        <Zap size={Math.round(size * 0.55)} strokeWidth={2.5} fill="currentColor" />
      </span>
      {wordmark && (
        <span className="font-serif text-[18px] tracking-tight text-text">
          Surge <span className="text-text-muted">Finance</span>
        </span>
      )}
    </span>
  );
}
