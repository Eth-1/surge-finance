"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Logo } from "@/components/shell/Logo";

/**
 * Full-page password prompt (§1.6). Rendered by a protected Server Component when
 * the `surge-auth` cookie is missing/invalid. On success the /api/auth route sets
 * the cookie and we router.refresh() so the page re-renders with the token.
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
      if (res.ok) router.refresh();
      else if (res.status === 429) setError("Too many attempts — please wait a minute and try again.");
      else setError("Incorrect password. Please try again.");
    } catch {
      setError("Unable to reach the server. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4">
      <div className="brand-glow pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden />
      <form onSubmit={submit} className="surge-card animate-scale-in relative w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-text-secondary" aria-hidden>
            <Lock size={16} />
          </span>
        </div>
        <h1 className="text-lg font-semibold">Finance team access</h1>
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
          {loading ? <><span className="spinner spinner-sm" /> Checking…</> : "Unlock"}
        </button>
      </form>
    </div>
  );
}
