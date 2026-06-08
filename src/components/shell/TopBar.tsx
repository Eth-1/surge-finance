"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { pageTitle } from "@/lib/nav";
import { Logo } from "./Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { openCommandPalette } from "@/components/CommandPalette";

/** Finance-console top bar: context title (desktop), mobile logo, ⌘K, theme. */
export function TopBar() {
  const pathname = usePathname() || "";

  return (
    <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border glass px-4"
      style={{ height: "var(--nav-height)" }}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="md:hidden"><Logo wordmark={false} /></span>
        <h1 className="truncate text-base font-semibold">{pageTitle(pathname)}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={openCommandPalette}
          className="btn btn-ghost gap-2 px-2 py-1.5 text-text-secondary sm:px-3"
          aria-label="Open command menu"
        >
          <Search size={15} />
          <span className="hidden sm:inline">Search…</span>
          <span className="kbd hidden sm:inline-flex">⌘K</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
