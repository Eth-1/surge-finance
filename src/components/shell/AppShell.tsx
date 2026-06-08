"use client";

import { usePathname } from "next/navigation";
import { isFinanceRoute } from "@/lib/nav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { PublicBar } from "./PublicBar";
import { CommandPalette } from "@/components/CommandPalette";

/**
 * Switches between two shells by route (routes/auth unchanged):
 *  - Finance routes → sidebar + top bar + mobile bottom nav + ⌘K palette.
 *  - Everything else (public /status) → minimal public bar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const finance = isFinanceRoute(pathname);

  if (finance) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to content</a>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 pb-24 md:pb-8">
              {children}
            </main>
          </div>
        </div>
        <BottomNav />
        <CommandPalette />
      </>
    );
  }

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <PublicBar />
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
    </>
  );
}
