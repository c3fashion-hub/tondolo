import type { Metadata, Viewport } from "next";
import { Fraunces, Figtree } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so phones never call Google Fonts.
const fraunces = Fraunces({ subsets: ["latin"], axes: ["SOFT", "WONK", "opsz"], variable: "--font-fraunces", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://tondolo.app"),
  title: { default: "Tondolo", template: "%s · Tondolo" },
  description: "Wedding money abroad, sorted.",
  applicationName: "Tondolo",
  appleWebApp: { capable: true, title: "Tondolo", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1018" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${fraunces.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
