"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

const PUBLIC_PATH_PREFIXES = [
  "/quote-accept",
  "/invoice-view",
  "/payment-return",
];

/**
 * Accounting-chrome switcher. Publieke routes (zoals klik-accepteer)
 * renderen zonder sidebar — ze zijn bedoeld voor klanten zonder account.
 */
export default function Chrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATH_PREFIXES.some((p) => pathname?.startsWith(p));

  if (isPublic) {
    return (
      <main
        id="main-content"
        className="min-h-screen bg-[var(--background)]"
      >
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 md:ml-56 flex flex-col">
        {/* Audit 2026-05-03: pre-fix the accounting routes had no mobile
            nav — `AccountingSidebar` is `hidden md:flex` and nothing
            replaced it below the breakpoint. MobileAccountingNav is
            `md:hidden` so it only appears on phone widths and stays
            invisible above 768px where the sidebar takes over. */}
        <MobileNav />
        <main
          id="main-content"
          className="flex-1 p-4 md:p-6 overflow-auto"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
