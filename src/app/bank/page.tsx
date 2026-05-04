import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { listBankAccounts } from "@/lib/bank/accounts";
import { getStats } from "@/lib/bank/transactions";
import { listCompanies } from "@/lib/companies";
import { listAccounts } from "@/lib/ledger/accounts";
import { paypalConfigured } from "@/lib/bank/providers/paypal";
import BankAccountForm from "./BankAccountForm";
import BankAccountsTable from "./BankAccountsTable";
import UploadCamtPanel from "./UploadCamtPanel";
import AutoMatchButton from "./AutoMatchButton";

export const dynamic = "force-dynamic";

export default function BankPage() {
  const accounts = listBankAccounts();
  const stats = getStats();
  const statsByAccount = Object.fromEntries(
    accounts.map((a) => [a.id, getStats(a.id)]),
  );
  const companies = listCompanies();
  const ledgerAccounts = listAccounts({ activeOnly: true });
  const paypalReady = paypalConfigured();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Overzicht
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Bank-import</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Bankrekeningen koppelen, transacties importeren, matchen aan
          facturen. Boekingen ontstaan automatisch zodra een transactie
          gematched is.
        </p>
      </header>

      {stats.unmatched > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-300" />
            <p className="text-sm text-amber-200">
              {stats.unmatched} transactie{stats.unmatched !== 1 ? "s" : ""}{" "}
              wachten op match
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AutoMatchButton />
            <Link
              href="/bank/transactions?status=unmatched"
              className="text-xs text-amber-300 hover:text-amber-100 underline"
            >
              Naar transacties
            </Link>
          </div>
        </div>
      )}

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-zinc-900/40">
          <h2 className="text-sm font-semibold text-zinc-200">
            Gekoppelde rekeningen
          </h2>
        </div>
        <BankAccountsTable
          accounts={accounts}
          companies={companies}
          ledgerAccounts={ledgerAccounts}
          paypalReady={paypalReady}
          stats={statsByAccount}
        />
      </section>

      {accounts.length > 0 && (
        <UploadCamtPanel accounts={accounts} />
      )}

      {accounts.some((a) => a.provider === "paypal") && !paypalReady && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
          <p className="font-semibold">PayPal niet geconfigureerd</p>
          <p className="text-xs text-zinc-400 mt-1">
            PayPal-rekening gevonden, maar{" "}
            <code className="bg-zinc-800 px-1 rounded">PAYPAL_CLIENT_ID</code>{" "}
            en{" "}
            <code className="bg-zinc-800 px-1 rounded">PAYPAL_CLIENT_SECRET</code>
            {" "}ontbreken in de server-omgeving. Maak een Live App aan op
            developer.paypal.com en zet de waarden in <code>.env</code>.
          </p>
        </div>
      )}

      <BankAccountForm
        companies={companies}
        ledgerAccounts={ledgerAccounts}
      />

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-zinc-500 space-y-3">
        <div>
          <p className="font-semibold text-zinc-300 mb-1">
            Bankmutaties downloaden
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Log in op Rabobank/ING zakelijk Internet Bankieren</li>
            <li>Ga naar Mutaties → Mutaties downloaden</li>
            <li>
              Kies formaat{" "}
              <span className="font-mono">CAMT.053</span> (XML, voorkeur)
              of <span className="font-mono">CSV</span>, en de periode
              (bv. afgelopen week of maand)
            </li>
            <li>Upload het bestand hierboven</li>
          </ol>
        </div>
        <p>
          XML (CAMT.053) heeft betere dedup-IDs en eindigt in &lt;0.1% bij
          valse duplicaten; CSV werkt prima maar gebruikt synthetische
          IDs (datum+bedrag+omschrijving) als de bank geen volgnr levert.
        </p>
        <p>
          PayPal-koppeling via API: maak een Live App aan op
          developer.paypal.com en zet PAYPAL_CLIENT_ID + SECRET in .env.
        </p>
      </div>
    </div>
  );
}
