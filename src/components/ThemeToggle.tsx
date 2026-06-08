"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";

/** Cycles system → light → dark. Shows the current mode's icon. */
export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const Icon = mode === "system" ? Monitor : mode === "light" ? Sun : Moon;
  const next = mode === "system" ? "light" : mode === "light" ? "dark" : "system";

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${mode}. Switch to ${next}.`}
      title={`Theme: ${mode} (click for ${next})`}
      className="btn btn-ghost grid h-9 w-9 place-items-center p-0"
    >
      <Icon size={16} />
    </button>
  );
}
