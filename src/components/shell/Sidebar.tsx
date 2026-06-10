"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { FINANCE_NAV, isActive } from "@/lib/nav";
import { Logo } from "./Logo";
import { SignOut } from "./SignOut";

/** Desktop finance-console sidebar (hidden < md). */
export function Sidebar() {
  const pathname = usePathname() || "";

  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex"
      style={{ width: "var(--sidebar-width)" }}>
      <div className="flex h-[var(--nav-height)] items-center px-4">
        <Link href="/dashboard" aria-label="Surge Finance home"><Logo /></Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {FINANCE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors " +
                (active ? "bg-surface-2 font-medium text-text" : "text-text-secondary hover:bg-surface-2 hover:text-text")
              }
            >
              {active && <span className="absolute inset-y-1 left-0 w-[2px] bg-primary-strong" aria-hidden />}
              <Icon size={18} className={active ? "text-primary" : ""} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        <Link href="/status" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text">
          <ExternalLink size={16} /> Public status page
        </Link>
        <SignOut />
      </div>
    </aside>
  );
}
