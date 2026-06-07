/** Empty / message state (§4.5g). */
export function EmptyState({
  icon = "📭",
  title,
  message,
  children,
}: {
  icon?: string;
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="surge-card flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-2 text-3xl opacity-70">{icon}</div>
      <p className="font-medium text-text">{title}</p>
      {message && <p className="muted mt-1 max-w-md text-sm">{message}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
