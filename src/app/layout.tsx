import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "CredCheck — Can I Trust This Seller?",
  description:
    "Paste a website, Instagram handle, or marketplace listing and get a plain-English trust assessment built from multiple independent signals.",
};

export const viewport: Viewport = {
  themeColor: "#05070a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
