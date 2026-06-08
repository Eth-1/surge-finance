"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
type Resolved = "light" | "dark";

interface ThemeCtx {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}

const STORAGE_KEY = "surge-theme-mode";
const Ctx = createContext<ThemeCtx>({ mode: "system", resolved: "dark", setMode: () => {}, cycle: () => {} });

function systemResolved(): Resolved {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: ThemeMode): Resolved {
  const resolved: Resolved = mode === "system" ? systemResolved() : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<Resolved>("dark");

  // Hydrate from storage + the data-theme the no-flash script already applied.
  useEffect(() => {
    let stored: ThemeMode = "system";
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark" || v === "system") stored = v;
    } catch {}
    setModeState(stored);
    setResolved((document.documentElement.getAttribute("data-theme") as Resolved) || apply(stored));
  }, []);

  // When in system mode, follow OS changes live.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(apply("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { window.localStorage.setItem(STORAGE_KEY, m); } catch {}
    setResolved(apply(m));
  }, []);

  const cycle = useCallback(() => {
    setMode(mode === "system" ? "light" : mode === "light" ? "dark" : "system");
  }, [mode, setMode]);

  return <Ctx.Provider value={{ mode, resolved, setMode, cycle }}>{children}</Ctx.Provider>;
}

export function useTheme() { return useContext(Ctx); }
