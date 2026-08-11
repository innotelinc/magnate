import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeApplier from "@/components/ThemeApplier";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Innotel Media — Unlimited streaming",
  description:
    "Subscribe to Innotel Media and stream movies, shows and more on any device. Monthly and yearly plans.",
  icons: { icon: "/favicon.svg" },
};

// Applies the saved theme (or the OS preference when "system") before the
// browser paints, preventing a flash of the wrong theme. Mirrors the logic in
// components/ThemeToggle.tsx (storage key "theme").
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ThemeApplier />
      </body>
    </html>
  );
}
