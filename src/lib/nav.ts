import { LayoutDashboard, ReceiptText, BarChart3, CalendarCheck, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary finance-console destinations (sidebar + mobile bottom nav + ⌘K). */
export const FINANCE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/submissions", label: "Submissions", icon: ReceiptText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/year-end", label: "Year-End", icon: CalendarCheck },
];

/** Routes that use the gated finance console shell (everything else = public shell). */
const FINANCE_PREFIXES = ["/dashboard", "/submissions", "/reports", "/year-end", "/budget-impact"];

export function isFinanceRoute(pathname: string): boolean {
  return FINANCE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/submissions": "Submissions",
  "/reports": "Reports",
  "/year-end": "Year-End Checklist",
  "/budget-impact": "Budget Impact",
};

export function pageTitle(pathname: string): string {
  const hit = Object.keys(TITLES).find((p) => pathname === p || pathname.startsWith(p + "/"));
  return hit ? TITLES[hit] : "Surge Finance";
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
