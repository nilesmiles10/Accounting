"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FileSignature,
  Users,
  Building2,
  Settings,
  ExternalLink,
  LogOut,
  Wallet,
  Landmark,
  PackageOpen,
  Truck,
  BookOpen,
  History,
  BarChart3,
  Package,
} from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: "/", label: "Overzicht", icon: LayoutDashboard },
  { href: "/quotes", label: "Offertes", icon: FileSignature },
  { href: "/invoices", label: "Facturen", icon: FileText },
  { href: "/purchase", label: "Inkoop", icon: PackageOpen },
  { href: "/clients", label: "Klanten", icon: Users },
  { href: "/suppliers", label: "Leveranciers", icon: Truck },
  { href: "/bank", label: "Bank", icon: Landmark },
  { href: "/ledger", label: "Grootboek", icon: BookOpen },
  { href: "/assets", label: "Activa", icon: Package },
  { href: "/journal", label: "Journaal", icon: History },
  { href: "/reports", label: "Rapportages", icon: BarChart3 },
  { href: "/settings/companies", label: "Bedrijven", icon: Building2 },
  { href: "/settings", label: "Instellingen", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="hidden md:flex w-56 h-screen bg-[var(--surface)] border-r border-[var(--border)] flex-col fixed left-0 top-0 z-10">
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Wallet className="w-6 h-6 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-bold text-zinc-100">Nova</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Accounting
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-[var(--surface-hover)]"
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}

        <div className="pt-3 mt-3 border-t border-[var(--border)]">
          <a
            href="https://novactrl.nl"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-200 hover:bg-[var(--surface-hover)] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="flex-1 truncate">Nova Control</span>
          </a>
        </div>
      </nav>

      <div className="p-3 border-t border-[var(--border)] space-y-2">
        {user && (
          <div className="flex items-center justify-between">
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
              className="p-1.5 rounded-md hover:bg-white/5 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
              aria-label="Uitloggen"
              title="Uitloggen"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <p className="text-[10px] text-zinc-600">Nova Accounting v0.1</p>
      </div>
    </aside>
  );
}
