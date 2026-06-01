import Link from "next/link";
import {
  Building2,
  Mail,
  Package,
  CreditCard,
  Shield,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Overzicht
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Instellingen</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/settings/companies"
          className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
        >
          <Building2 className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">Bedrijven</p>
            <p className="text-xs text-zinc-500">
              Jouw facturerende bedrijven beheren
            </p>
          </div>
        </Link>
        <Link
          href="/settings/email"
          className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
        >
          <Mail className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">E-mail</p>
            <p className="text-xs text-zinc-500">
              Postmark API-token voor facturen versturen
            </p>
          </div>
        </Link>
        <Link
          href="/settings/items"
          className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
        >
          <Package className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">Catalog</p>
            <p className="text-xs text-zinc-500">
              Herbruikbare regels voor offertes en facturen
            </p>
          </div>
        </Link>
        <Link
          href="/settings/mollie"
          className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
        >
          <CreditCard className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">Mollie</p>
            <p className="text-xs text-zinc-500">
              Betaallinks (iDEAL / creditcard) in facturen
            </p>
          </div>
        </Link>
        <Link
          href="/settings/security"
          className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
        >
          <Shield className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">Beveiliging</p>
            <p className="text-xs text-zinc-500">
              2FA en wachtwoord van je eigen account
            </p>
          </div>
        </Link>
        <Link
          href="/settings/users"
          className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
        >
          <Users className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">Gebruikers</p>
            <p className="text-xs text-zinc-500">
              Toegang beheren, rol wisselen, reset wachtwoord/2FA
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
