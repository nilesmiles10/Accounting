import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Chrome from "@/components/Chrome";
import AuthGate from "@/components/AuthGate";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Nova Accounting",
  description: "Facturatie & boekhouding",
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={inter.variable}>
      <body className="antialiased">
        <a href="#main-content" className="skip-link">
          Naar hoofdinhoud
        </a>
        <AuthGate>
          <Chrome>{children}</Chrome>
        </AuthGate>
      </body>
    </html>
  );
}
