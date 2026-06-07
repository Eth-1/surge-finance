"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="btn btn-ghost px-2 py-1 text-base"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
