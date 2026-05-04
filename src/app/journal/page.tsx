import Link from "next/link";
import { listEntries } from "@/lib/ledger/journal";
import { listAccounts } from "@/lib/ledger/accounts";
import { formatEUR, formatDate } from "@/lib/format";
import JournalFilters from "./JournalFilters";

export const dynamic = "force-dynamic";

export default function JournalPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; account_code?: string; source_type?: string };
}) {
  const entries = listEntries({
    from: searchParams.from,
    to: searchParams.to,
    account_code: searchParams.account_code,
    source_type: searchParams.source_type,
  });
  const accounts = listAccounts({ activeOnly: true });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← Overzicht
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">
            Journaalposten
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Volledige audit-trail van boekingen. Filter op periode, rekening
            of bron.
          </p>
        </div>
        <Link
          href="/journal/new"
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg whitespace-nowrap"
        >
          + Handmatige boeking
        </Link>
      </header>

      <JournalFilters
        accounts={accounts}
        currentFrom={searchParams.from || ""}
        currentTo={searchParams.to || ""}
        currentAccountCode={searchParams.account_code || ""}
        currentSourceType={searchParams.source_type || ""}
      />

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          Geen boekingen gevonden.
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <article
              key={e.id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden"
            >
              <header className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    {e.description}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {formatDate(e.date)} · {e.source_type}
                    {e.locked === 1 ? " · 🔒" : ""}
                  </p>
                </div>
                {e.source_type === "invoice" && e.source_id && (
                  <Link
                    href={`/invoices/${e.source_id}`}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    → factuur
                  </Link>
                )}
                {e.source_type === "purchase" && e.source_id && (
                  <Link
                    href={`/purchase/${e.source_id}`}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    → inkoop
                  </Link>
                )}
                {e.source_type === "bank_match" && (
                  <Link
                    href={`/bank/transactions?status=matched`}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    → bank-mutatie
                  </Link>
                )}
              </header>
              <table className="w-full text-sm">
                <thead className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-1.5 font-medium">
                      Rekening
                    </th>
                    <th className="text-left px-4 py-1.5 font-medium">
                      Omschrijving
                    </th>
                    <th className="text-right px-4 py-1.5 font-medium w-28">
                      Debet
                    </th>
                    <th className="text-right px-4 py-1.5 font-medium w-28">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {e.lines.map((l) => (
                    <tr
                      key={l.id}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-4 py-1.5 font-mono text-zinc-400">
                        {l.account_code}
                      </td>
                      <td className="px-4 py-1.5 text-zinc-300">
                        {l.description || "—"}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-zinc-200">
                        {l.debit_cents > 0
                          ? formatEUR(l.debit_cents)
                          : ""}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-zinc-200">
                        {l.credit_cents > 0
                          ? formatEUR(l.credit_cents)
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
