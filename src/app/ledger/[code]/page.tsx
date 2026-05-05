import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getAccount } from "@/lib/ledger/accounts";
import { getAccountLedger } from "@/lib/ledger/journal";
import { formatEUR, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  invoice: "Verkoop",
  purchase: "Inkoop",
  bank_match: "Bank",
  manual: "Handmatig",
  opening: "Opening",
  vat_submission: "BTW-aangifte",
};

export default function AccountLedgerPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { from?: string; to?: string; year?: string };
}) {
  const account = getAccount(params.code);
  if (!account) notFound();

  const year = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();
  const from = searchParams.from || `${year}-01-01`;
  const to = searchParams.to || `${year}-12-31`;

  const ledger = getAccountLedger(account.code, from, to);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/ledger"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Grootboek
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
          {account.code}{" "}
          <span className="font-sans font-normal text-zinc-300">
            {account.name}
          </span>
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Grootboekkaart {from} t/m {to}. Mutaties chronologisch met lopend saldo.
        </p>
      </header>

      <form className="flex gap-2 items-end">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Van</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Tot</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </label>
        <button
          type="submit"
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg"
        >
          Toepassen
        </button>
      </form>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
          <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/40">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-24">Datum</th>
              <th className="text-left px-3 py-2 font-medium w-20">Bron</th>
              <th className="text-left px-3 py-2 font-medium">Omschrijving</th>
              <th className="text-right px-3 py-2 font-medium w-28">Debet</th>
              <th className="text-right px-3 py-2 font-medium w-28">Credit</th>
              <th className="text-right px-3 py-2 font-medium w-32">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[var(--border)] bg-zinc-900/30">
              <td className="px-3 py-1.5 text-zinc-500 italic" colSpan={5}>
                Beginsaldo per {from}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                {formatEUR(ledger.opening_balance_cents)}
              </td>
            </tr>
            {ledger.lines.length === 0 ? (
              <tr className="border-t border-[var(--border)]">
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-zinc-500"
                >
                  Geen mutaties in deze periode.
                </td>
              </tr>
            ) : (
              ledger.lines.map((l, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 text-zinc-400 font-mono text-xs">
                    {formatDate(l.date)}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-500 text-xs">
                    {SOURCE_LABEL[l.source_type] || l.source_type}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-200">
                    <Link
                      href={`/journal?account_code=${account.code}`}
                      className="hover:text-emerald-300"
                    >
                      {l.line_description || l.description}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                    {l.debit_cents > 0 ? formatEUR(l.debit_cents) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                    {l.credit_cents > 0 ? formatEUR(l.credit_cents) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                    {formatEUR(l.running_balance_cents)}
                  </td>
                </tr>
              ))
            )}
            <tr className="border-t-2 border-zinc-700 bg-zinc-900/40">
              <td className="px-3 py-2 font-semibold text-zinc-200" colSpan={5}>
                Eindsaldo per {to}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold text-zinc-100">
                {formatEUR(ledger.ending_balance_cents)}
              </td>
            </tr>
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
