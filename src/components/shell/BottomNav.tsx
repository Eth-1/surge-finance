"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FINANCE_NAV, isActive } from "@/lib/nav";

/** Mobile finance bottom tab bar (hidden ≥ md). */
export function BottomNav() {
  const pathname = usePathname() || "";

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-border glass md:hidden"
      style={{ gridTemplateColumns: `repeat(${FINANCE_NAV.length}, 1fr)` }}
      aria-label="Primary"
    >
      {FINANCE_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={"flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors " + (active ? "text-primary" : "text-text-secondary")}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
