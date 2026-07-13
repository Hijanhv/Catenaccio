import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catenaccio · In-play market-making agent",
  description:
    "Autonomous in-play football market-making agent on TxLINE's verified feed. Reprices in ~400ms so a book is never picked off by latency arbitrage, and proves every price on-chain.",
};

export const viewport: Viewport = {
  themeColor: "#F6F8FB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
