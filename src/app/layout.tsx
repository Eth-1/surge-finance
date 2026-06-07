import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NavBar } from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "SFU Surge Finance",
  description: "SFU Surge Finance Dashboard — reimbursement status & finance overview.",
};

/**
 * Runs before paint to apply the persisted theme (§4.1g / X5), preventing a
 * light/dark flash on load. Defaults to dark when nothing is stored.
 */
const noFlashThemeScript = `(function(){try{var t=localStorage.getItem('surge-theme');document.documentElement.setAttribute('data-theme',(t==='light'||t==='dark')?t:'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <NavBar />
          <main className="mx-auto w-full max-w-[1200px] px-4 py-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
