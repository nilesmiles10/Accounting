import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NewAssetForm from "./NewAssetForm";
import { listAccounts } from "@/lib/ledger/accounts";

export const dynamic = "force-dynamic";

export default function NewAssetPage() {
  const accounts = listAccounts({ activeOnly: true });
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <Link
          href="/assets"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Vaste activa
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Nieuw activum
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Activeer een investering &gt; €450. Categorie bepaalt de
          standaard levensduur en grootboekrekeningen — overschrijf indien
          nodig.
        </p>
      </header>
      <NewAssetForm accounts={accounts} />
    </div>
  );
}
