"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Car, ExternalLink, PieChart, CornerDownLeft, type LucideIcon } from "lucide-react";
import { FINANCE_NAV } from "@/lib/nav";
import { RECEIPT_FORM_URL, MILEAGE_FORM_URL } from "@/lib/forms";

const EVENT = "surge:cmdk";
/** Open the palette from anywhere (e.g. the top-bar Search button). */
export function openCommandPalette() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

interface Cmd { id: string; label: string; hint?: string; icon: LucideIcon; run: () => void; }

/** ⌘K / Ctrl-K command menu: jump to pages + quick actions. Keyboard-first. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Cmd[] = useMemo(() => {
    const go = (href: string) => () => router.push(href);
    const ext = (url: string) => () => window.open(url, "_blank", "noopener,noreferrer");
    return [
      ...FINANCE_NAV.map((n) => ({ id: n.href, label: `Go to ${n.label}`, hint: "Page", icon: n.icon, run: go(n.href) })),
      { id: "budget", label: "Go to Budget Impact", hint: "Page", icon: PieChart, run: go("/budget-impact") },
      { id: "status", label: "Open public Status page", hint: "Page", icon: ExternalLink, run: go("/status") },
      { id: "receipt", label: "Open Receipt submission form", hint: "Form", icon: FileText, run: ext(RECEIPT_FORM_URL) },
      { id: "mileage", label: "Open Mileage submission form", hint: "Form", icon: Car, run: ext(MILEAGE_FORM_URL) },
    ];
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  const close = useCallback(() => { setOpen(false); setQuery(""); setActive(0); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENT, onOpen as EventListener);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(EVENT, onOpen as EventListener); };
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = filtered[active]; if (c) { c.run(); close(); } }
  }

  return (
    <div className="no-print fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command menu">
      <div className="absolute inset-0 bg-black/50 animate-in" onClick={close} aria-hidden />
      <div className="animate-scale-in relative w-full max-w-lg overflow-hidden rounded-xl border border-border-strong bg-surface shadow-lg" onKeyDown={onListKey}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={16} className="text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            className="w-full bg-transparent py-3 text-sm text-text outline-none placeholder:text-text-muted"
            aria-label="Search commands"
          />
          <span className="kbd">esc</span>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-muted">No matches</li>}
          {filtered.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.id}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { c.run(); close(); }}
                  className={"flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors " + (i === active ? "bg-surface-2 text-text" : "text-text-secondary")}
                >
                  <Icon size={16} className={i === active ? "text-primary" : ""} />
                  <span className="flex-1">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-text-muted">{c.hint}</span>}
                  {i === active && <CornerDownLeft size={14} className="text-text-muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
