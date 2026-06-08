"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Minimal header for the public /status surface — no finance tabs. */
export function PublicBar() {
  return (
    <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border glass px-4"
      style={{ height: "var(--nav-height)" }}>
      <Link href="/status" aria-label="Surge Finance home"><Logo /></Link>
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="hidden text-sm text-text-secondary transition-colors hover:text-text sm:inline">
          Finance team →
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
