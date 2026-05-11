"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDialogA11y } from "@/lib/useDialogA11y";
import {
  Menu,
  X,
  Wallet,
  LayoutDashboard,
  FileText,
  FileSignature,
  Users,
  Building2,
  Settings,
  ExternalLink,
  LogOut,
  Mail,
  Package,
  CreditCard,
  ChevronRight,
  Landmark,
  PackageOpen,
  Truck,
  BookOpen,
  History,
  BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/components/AuthGate";

interface NavChild {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overzicht", icon: LayoutDashboard },
  { href: "/quotes", label: "Offertes", icon: FileSignature },
  { href: "/invoices", label: "Facturen", icon: FileText },
  { href: "/purchase", label: "Inkoop", icon: PackageOpen },
  { href: "/clients", label: "Klanten", icon: Users },
  { href: "/suppliers", label: "Leveranciers", icon: Truck },
  { href: "/bank", label: "Bank", icon: Landmark },
  { href: "/ledger", label: "Grootboek", icon: BookOpen },
  { href: "/journal", label: "Journaal", icon: History },
  { href: "/reports", label: "Rapportages", icon: BarChart3 },
  { href: "/mail-log", label: "E-mail log", icon: Mail },
  {
    href: "/settings",
    label: "Instellingen",
    icon: Settings,
    // Audit 2026-05-03: pre-fix the settings sub-pages (companies, email,
    // items, mollie) were only reachable via in-page card links on the
    // /accounting/settings index. On mobile the user complained they
    // didn't see the subpages at all because the drawer only showed the
    // settings parent. Expose all four directly here so the nav matches
    // the actual route tree.
    children: [
      { href: "/settings/companies", label: "Bedrijven", icon: Building2 },
      { href: "/settings/email", label: "E-mail", icon: Mail },
      { href: "/settings/items", label: "Catalog", icon: Package },
      { href: "/settings/mollie", label: "Mollie", icon: CreditCard },
    ],
  },
];

/**
 * Mobile counterpart of AccountingSidebar.
 *
 * Pre-fix the accounting routes had no mobile navigation at all:
 * `AccountingSidebar` is `hidden md:flex` (correct, mirrors the main
 * Sidebar pattern) but unlike the main chrome there was no mobile
 * drawer to replace it below the breakpoint. Result: the sidebar
 * vanished and operators couldn't navigate within /accounting on a
 * phone. Filed in docs/NEXT.md / responsive-design audit 2026-05-03.
 *
 * This component matches the existing MobileNav pattern (sticky
 * top bar + drawer with a11y trap) but with accounting-specific
 * green chrome and the accounting nav items. Sits in the layout
 * inside AccountingChrome.
 */
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);
  const { user, logout } = useAuth();

  // Close drawer when route changes (operator just tapped a link).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // H13 a11y: Escape key + focus trap + focus restore.
  useDialogA11y({
    open,
    onClose: () => setOpen(false),
    containerRef: drawerRef as React.RefObject<HTMLElement>,
  });

  // Auto-expand all parent items when the drawer opens (mirrors the
  // Nova Control MobileNav UX so subpages are scannable in one glance).
  useEffect(() => {
    if (!open) return;
    const exp: Record<string, boolean> = {};
    for (const item of NAV_ITEMS) {
      if (item.children) exp[item.href] = true;
    }
    setExpanded((prev) => ({ ...prev, ...exp }));
  }, [open]);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const toggleExpand = (href: string) => {
    setExpanded((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          <span className="text-sm font-bold text-zinc-100">
            Nova <span className="text-zinc-500 font-normal">Accounting</span>
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-white/5 text-zinc-300"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Accounting navigatie"
            className="relative w-64 h-full bg-[var(--surface)] border-r border-[var(--border)] overflow-y-auto flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-zinc-100">Nova</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    Accounting
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-white/5"
                aria-label="Navigatie sluiten"
              >
                <X className="w-5 h-5 text-zinc-300" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 py-2">
              {NAV_ITEMS.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                const isExpanded = expanded[it.href];
                const hasChildren = it.children && it.children.length > 0;

                return (
                  <div key={it.href}>
                    <div className="flex items-center">
                      <Link
                        href={it.href}
                        className={`flex-1 flex items-center gap-3 px-4 py-2.5 text-sm ${
                          active
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "text-zinc-300 hover:bg-white/5"
                        }`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span className="flex-1 truncate">{it.label}</span>
                      </Link>
                      {hasChildren && (
                        <button
                          onClick={() => toggleExpand(it.href)}
                          aria-label={isExpanded ? `${it.label} submenu inklappen` : `${it.label} submenu uitklappen`}
                          aria-expanded={isExpanded}
                          className="px-4 py-2.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                        >
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    {hasChildren && isExpanded && (
                      <div className="ml-4 border-l border-[var(--border)]">
                        {it.children!.map((child) => {
                          const ChildIcon = child.icon;
                          const childActive = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`flex items-center gap-3 pl-6 pr-4 py-2 text-sm ${
                                childActive ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                              }`}
                            >
                              <ChildIcon className="w-3.5 h-3.5" aria-hidden="true" />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="mt-2 pt-2 border-t border-[var(--border)]">
                <a
                  href="https://novactrl.nl"
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  <span className="flex-1 truncate">Nova Control</span>
                </a>
              </div>
            </nav>

            {user && (
              <div className="p-3 border-t border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400 flex-shrink-0">
                    {(user.username[0] || "?").toUpperCase()}
                  </div>
                  <span className="text-xs text-zinc-400 truncate">
                    {user.username}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-md hover:bg-white/5 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                  aria-label="Uitloggen"
                  title="Uitloggen"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
