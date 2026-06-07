import Link from "next/link";

/** URL-param pagination (?page=N), preserving the active filters. */
export function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function href(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== "page") params.set(k, v);
    }
    params.set("page", String(p));
    return `/submissions?${params.toString()}`;
  }

  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link className="btn btn-ghost px-3 py-1" href={href(page - 1)}>← Prev</Link>
      ) : (
        <span className="btn btn-ghost px-3 py-1 opacity-50">← Prev</span>
      )}
      <span className="muted">Page {page} of {totalPages}</span>
      {page < totalPages ? (
        <Link className="btn btn-ghost px-3 py-1" href={href(page + 1)}>Next →</Link>
      ) : (
        <span className="btn btn-ghost px-3 py-1 opacity-50">Next →</span>
      )}
    </div>
  );
}
