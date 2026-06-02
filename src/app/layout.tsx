import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RedNote Lite",
  description: "A full-stack consumer content app starter with AI search, recommendations, and admin moderation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full bg-stone-50 text-slate-950 antialiased">
        {children}
      </body>
    </html>
  );
}
