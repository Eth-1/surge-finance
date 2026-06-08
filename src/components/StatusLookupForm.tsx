"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const REMEMBER_KEY = "surge-last-email";
const REMEMBER_MS = 14 * 86400000; // 14 days

/**
 * Email lookup form for /status (§4.4). Navigates to /status?email=… so the
 * Server Component re-renders with results. Uses useTransition so the button's
 * pending state resets automatically once the new page has rendered.
 *
 * Convenience: the last-used email is remembered for 14 days and pre-filled into
 * the field on return visits — but the lookup is NOT run automatically; the
 * person still presses "Check status".
 */
export function StatusLookupForm({ defaultEmail = "", preserveId = "" }: { defaultEmail?: string; preserveId?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [isPending, startTransition] = useTransition();

  // Pre-fill (don't auto-submit) from the remembered email when no email is in the URL.
  useEffect(() => {
    if (defaultEmail) return;
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { email?: string; exp?: number };
      if (saved.email && saved.exp && Date.now() < saved.exp) setEmail(saved.email);
    } catch {}
  }, [defaultEmail]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    try {
      window.localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: normalized, exp: Date.now() + REMEMBER_MS }));
    } catch {}
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
