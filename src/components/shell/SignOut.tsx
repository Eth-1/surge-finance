"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Clears the auth cookie (DELETE /api/auth) and returns to the public page. */
export function SignOut({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {}
    router.push("/status");
    router.refresh();
  }

  return (
    <button onClick={signOut} disabled={busy} className="btn btn-ghost w-full justify-start gap-2 text-text-secondary">
      <LogOut size={16} />
      {!compact && <span>Sign out</span>}
    </button>
  );
}
