import Link from "next/link";

export default function NotFound() {
  return (
    <div className="surge-card mx-auto max-w-md text-center">
      <div className="mb-2 text-3xl">🧭</div>
      <h1 className="mb-1 text-lg font-semibold">Page not found</h1>
      <p className="muted mb-4 text-sm">That page doesn’t exist.</p>
      <Link className="btn btn-primary" href="/status">Go to Status lookup</Link>
    </div>
  );
}
