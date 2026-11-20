import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemedToaster } from "@/components/themed-toaster";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], display: "swap" });
const sora = Sora({ variable: "--font-sora", subsets: ["latin", "latin-ext"], weight: ["500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "nexdeals", template: "%s · nexdeals" },
  description: "nexdeals – CRM zaměřené na prodejní pipeline, dealy a aktivity.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f7fb" }, { media: "(prefers-color-scheme: dark)", color: "#0b0d14" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning className={`${inter.variable} ${sora.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider>
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
