import "./globals.css";
import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/shell/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Surge Finance", template: "%s · Surge Finance" },
  description: "Reimbursement status & finance operations for the SFU Surge club.",
  applicationName: "Surge Finance",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Surge Finance",
    description: "Track your reimbursement and submit receipts & mileage.",
    type: "website",
  },
};

/**
 * Applies the persisted theme before paint (no flash). Reads the theme MODE
 * (system/light/dark) and resolves "system" against the OS preference.
 */
const noFlashThemeScript = `(function(){try{var m=localStorage.getItem('surge-theme-mode')||'system';var sys=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var t=(m==='light'||m==='dark')?m:sys;document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
