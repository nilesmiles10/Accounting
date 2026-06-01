import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <Link
          href="/settings"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Instellingen
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Gebruikers</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Toegang beheren. Alleen admins kunnen gebruikers aanmaken, rol
          wijzigen, wachtwoorden resetten en 2FA-secrets resetten als
          iemand z&apos;n authenticator-toestel kwijt is.
        </p>
      </header>
      <UsersClient />
    </div>
  );
}
