import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Pixelify_Sans } from "next/font/google";

import "./globals.css";

// Pixelify Sans for headings, buttons, scores and the scoreboard; Chakra Petch (squared and sporty, but smooth) for the
// smaller running text, which read too pixelated in a pixel font (user, 2026-10-11).
const display = Pixelify_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "700"], variable: "--font-display" });
const body = Chakra_Petch({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-body" });

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
  icons: { icon: "/art/favicon-32.png", apple: "/art/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#070a18", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="stage" aria-hidden>
          <div className="crowd c1" />
          <div className="crowd c2" />
          <div className="crowd c3" />
        </div>
        {children}
      </body>
    </html>
  );
}
