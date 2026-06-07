/** Chart container with the §4.5g empty state (centered 📊, no canvas). */
export function ChartCard({
  title,
  hasData,
  height = 300,
  children,
}: {
  title: string;
  hasData: boolean;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="surge-card">
      <p className="section-title mb-3">{title}</p>
      {hasData ? (
        <div style={{ height }}>{children}</div>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-md text-center"
          style={{ height, background: "var(--color-surface-2)" }}
        >
          <div className="mb-1 text-3xl opacity-60">📊</div>
          <p className="muted text-sm">No expense data for this period.</p>
        </div>
      )}
    </div>
  );
}
