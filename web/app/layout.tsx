import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { Backdrop } from "@/components/Brand.tsx";

import "./globals.css";

// One clean sans-serif for everything, the wordmark in its heaviest weight (user, 2026-10-18: "sleek and simple").
const sans = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans" });

const site = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Futkrill",
  description: "Seven football prompts a day. The more obscure your correct answer, the more you score.",
  openGraph: {
    title: "Futkrill",
    description: "Seven football prompts a day. The more obscure your correct answer, the more you score.",
    images: [{ url: "/art/og.png", width: 1200, height: 630 }],
  },
  icons: { icon: [{ url: "/art/ball.svg", type: "image/svg+xml" }, { url: "/art/favicon-32.png", sizes: "32x32" }], apple: "/art/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <div className="backdrop" aria-hidden>
          <Backdrop />
        </div>
        {children}
      </body>
    </html>
  );
}
