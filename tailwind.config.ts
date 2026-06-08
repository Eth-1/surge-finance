import type { Config } from "tailwindcss";

/**
 * Colors are mapped to the §4.1a/b CSS custom properties (defined in
 * globals.css). Components therefore reference token names (bg-surface,
 * text-secondary, …) and NEVER hardcode hex values — theme switching is handled
 * entirely by swapping the variables on <html data-theme>.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        "surface-3": "var(--color-surface-3)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        text: "var(--color-text)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        primary: "var(--color-primary)",
        "primary-strong": "var(--color-primary-strong)",
        "primary-light": "var(--color-primary-light)",
        accent: "var(--color-accent)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
        action: "var(--color-action)",
        ring: "var(--color-ring)",
        "card-bg": "var(--card-bg)",
      },
      backgroundImage: {
        "brand-gradient": "var(--gradient-brand)",
        "brand-glow": "var(--brand-glow)",
      },
      borderColor: { DEFAULT: "var(--color-border)" },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      transitionTimingFunction: { surge: "cubic-bezier(0.4, 0, 0.2, 1)" },
    },
  },
  plugins: [],
};

export default config;
