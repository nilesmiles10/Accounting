import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default function SecurityPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <Link
          href="/settings"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Instellingen
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Beveiliging
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Twee-factor authenticatie en wachtwoord voor je eigen account.
        </p>
      </header>

      <SecurityClient />
    </div>
  );
}
