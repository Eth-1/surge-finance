"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/status", label: "Status" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/submissions", label: "Submissions" },
  { href: "/reports", label: "Reports" },
  { href: "/year-end", label: "Year-End" },
];

export function NavBar() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header
      className="no-print sticky top-0 z-40 glass"
      style={{ minHeight: "var(--nav-height)" }}
    >
      <div className="flex items-center justify-between px-4" style={{ height: "var(--nav-height)" }}>
        <div className="flex items-center gap-6">
          <Link href="/status" className="flex items-center gap-2 font-semibold text-text">
            <span className="text-lg">⚡</span>
            <span>Surge Finance</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (isActive(t.href) ? "bg-surface-2 text-primary" : "text-text-secondary hover:text-text")
                }
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Mobile hamburger (A-1) */}
          <button
            className="btn btn-ghost px-2 py-1 text-lg md:hidden"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <nav className="border-t border-border px-4 py-2 md:hidden">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={
                "block rounded-md px-3 py-2 text-sm transition-colors " +
                (isActive(t.href) ? "bg-surface-2 text-primary" : "text-text-secondary hover:text-text")
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
