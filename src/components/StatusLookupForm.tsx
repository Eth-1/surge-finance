"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Email lookup form for /status (§4.4). Navigates to /status?email=… so the
 * Server Component re-renders with results (and middleware can rate-limit the
 * lookup). The email is sent normalized; the deep-link id (if any) is preserved.
 */
export function StatusLookupForm({ defaultEmail = "", preserveId = "" }: { defaultEmail?: string; preserveId?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setLoading(true);
    const params = new URLSearchParams({ email: normalized });
    if (preserveId) params.set("id", preserveId);
    router.push(`/status?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        className="input"
        placeholder="you@example.com (the email on your reimbursement form)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <button type="submit" className="btn btn-primary whitespace-nowrap" disabled={loading || !email.trim()}>
        {loading ? "Checking…" : "Check status"}
      </button>
    </form>
  );
}
