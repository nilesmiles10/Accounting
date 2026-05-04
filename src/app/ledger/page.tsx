import Link from "next/link";
import {
  listAccounts,
  getAccountBalance,
} from "@/lib/ledger/accounts";
import LedgerManager from "./LedgerManager";

export const dynamic = "force-dynamic";

export default function LedgerPage() {
  const accounts = listAccounts();
  const today = new Date().toISOString().slice(0, 10);
  const accountsWithBalance = accounts.map((a) => ({
    ...a,
    balance_cents: getAccountBalance(a.code, today),
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Overzicht
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Grootboek</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Rekeningschema met saldo per rekening (peildatum vandaag).
          Boekingen ontstaan automatisch bij finaliseren van facturen,
          goedkeuren van inkoopfacturen en bank-matches. Je kan hier
          rekeningen toevoegen, hernoemen of (indien ongebruikt) verwijderen.
        </p>
      </header>

      <LedgerManager initial={accountsWithBalance} />
    </div>
  );
}
