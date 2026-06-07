"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Full-page password prompt (§1.6), styled to the design system. Rendered by a
 * protected Server Component when the `surge-auth` cookie is missing/invalid.
 * On success the /api/auth route sets the cookie and we router.refresh() so the
 * page re-renders server-side with the token present.
 */
export function AuthGate({ area = "this page" }: { area?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.refresh();
      } else if (res.status === 429) {
        setError("Too many attempts — please wait a minute and try again.");
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Unable to reach the server. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <form onSubmit={submit} className="surge-card w-full max-w-sm">
        <div className="mb-1 text-2xl">⚡</div>
        <h1 className="mb-1 text-lg font-semibold">Surge Finance</h1>
        <p className="muted mb-4 text-sm">Enter the dashboard password to access {area}.</p>
        <input
          type="password"
          className="input mb-3"
          placeholder="Password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mb-3 text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={loading || !password}>
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
