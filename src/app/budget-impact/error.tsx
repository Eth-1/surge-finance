"use client";

export default function BudgetImpactError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="surge-card mx-auto max-w-md text-center">
      <div className="mb-2 text-3xl">⚠️</div>
      <h2 className="mb-1 font-semibold">Couldn’t load the preview</h2>
      <p className="muted mb-4 text-sm">Please try again in a moment.</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
