"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  return (
    <header
      className="no-print sticky top-0 z-40 glass flex items-center justify-between px-4"
      style={{ height: "var(--nav-height)" }}
    >
      <div className="flex items-center gap-6">
        <Link href="/status" className="flex items-center gap-2 font-semibold text-text">
          <span className="text-lg">⚡</span>
          <span>Surge Finance</span>
        </Link>
        <nav className="hidden gap-1 md:flex">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (active ? "bg-surface-2 text-primary" : "text-text-secondary hover:text-text")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <ThemeToggle />
    </header>
  );
}
