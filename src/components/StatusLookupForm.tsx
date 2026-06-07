"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Email lookup form for /status (§4.4). Navigates to /status?email=… so the
 * Server Component re-renders with results. Uses useTransition so the button's
 * pending state resets automatically once the new page has rendered (fixes the
 * "stuck on Checking…" bug).
 */
export function StatusLookupForm({ defaultEmail = "", preserveId = "" }: { defaultEmail?: string; preserveId?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    const params = new URLSearchParams({ email: normalized });
    if (preserveId) params.set("id", preserveId);
    startTransition(() => router.push(`/status?${params.toString()}`));
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
      <button type="submit" className="btn btn-primary whitespace-nowrap" disabled={isPending || !email.trim()}>
        {isPending ? (
          <>
            <span className="spinner spinner-sm" /> Checking…
          </>
        ) : (
          "Check status"
        )}
      </button>
    </form>
  );
}
