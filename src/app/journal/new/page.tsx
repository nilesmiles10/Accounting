import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listAccounts } from "@/lib/ledger/accounts";
import { listCompanies } from "@/lib/companies";
import ManualJournalForm from "./ManualJournalForm";

export const dynamic = "force-dynamic";

export default function NewJournalPage() {
  const accounts = listAccounts({ activeOnly: true });
  const companies = listCompanies();
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <Link
          href="/journal"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Journaal
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Handmatige journaalpost
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Voor correcties, openingsbalans, jaarafsluiting of overige
          mutaties die niet uit een factuur komen. Som van debet moet
          gelijk zijn aan som van credit.
        </p>
      </header>

      <ManualJournalForm accounts={accounts} companies={companies} />

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-zinc-500 space-y-2">
        <p className="font-semibold text-zinc-300">Voorbeelden</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="text-zinc-300">Openingsbalans Rabobank € 12.345</span>{" "}
            — debet 1100, credit 1900 RC directie. Type: openingsbalans.
          </li>
          <li>
            <span className="text-zinc-300">Resultaat 2025 naar EV</span>{" "}
            — debet 8000 omzet, credit 1900 RC directie (winstuitkering)
            of een eigen vermogen-rekening. Type: correctie.
          </li>
          <li>
            <span className="text-zinc-300">Correctie boeking</span> — als
            een eerdere boeking fout was, boek tegen via deze post (geen
            DELETE op originele post).
          </li>
        </ul>
      </div>
    </div>
  );
}
