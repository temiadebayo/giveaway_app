import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Giveaway App - Skill-Based Giveaways",
    template: "%s | Giveaway App",
  },
  description: "The ultimate skill-based giveaway platform. Compete, win, and flex. Built for the culture.",
  keywords: ["giveaway", "contests", "skill-based", "gaming", "prizes", "win"],
  authors: [{ name: "Giveaway App" }],
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [
      { url: "/favicon.png", sizes: "180x180" },
    ],
    shortcut: "/favicon.png",
  },
  openGraph: {
    title: "Giveaway App - Skill-Based Giveaways",
    description: "The ultimate skill-based giveaway platform. Compete, win, and flex.",
    type: "website",
    locale: "en_US",
    siteName: "Giveaway App",
  },
  twitter: {
    card: "summary_large_image",
    title: "Giveaway App",
    description: "The ultimate skill-based giveaway platform.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
