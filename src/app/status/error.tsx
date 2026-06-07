"use client";

export default function StatusError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="surge-card mx-auto max-w-md text-center">
      <div className="mb-2 text-3xl">⚠️</div>
      <h2 className="mb-1 font-semibold">Something went wrong</h2>
      <p className="muted mb-4 text-sm">Unable to load the status lookup. Please try again.</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
