import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { generateTrialBalance } from "@/lib/reports/trial-balance";
import { formatEUR } from "@/lib/format";
import CoverageBanner from "@/components/CoverageBanner";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  asset: "Activa",
  liability: "Passiva",
  equity: "EV",
  income: "Omzet",
  expense: "Kosten",
};

export default function TrialBalancePage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; year?: string };
}) {
  const year = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();
  const from = searchParams.from || `${year}-01-01`;
  const to = searchParams.to || `${year}-12-31`;
  const report = generateTrialBalance(from, to);

  // Group per type
  const byType = new Map<string, typeof report.lines>();
  for (const line of report.lines) {
    const arr = byType.get(line.type) || [];
    arr.push(line);
    byType.set(line.type, arr);
  }
  const typeOrder = ["asset", "liability", "equity", "income", "expense"];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/reports"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Rapportages
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Proefbalans</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Periode {report.from} t/m {report.to}. Sanity-check voor je
          accountant: debet- en credit-totalen moeten exact gelijk zijn.
        </p>
      </header>

      <CoverageBanner />

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
              <th className="text-left px-4 py-2 font-medium w-20">Code</th>
              <th className="text-left px-4 py-2 font-medium">Rekening</th>
              <th className="text-right px-4 py-2 font-medium w-32">Debet</th>
              <th className="text-right px-4 py-2 font-medium w-32">Credit</th>
              <th className="text-right px-4 py-2 font-medium w-32">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {typeOrder.map((type) => {
              const list = byType.get(type) || [];
              if (list.length === 0) return null;
              return (
                <>
                  <tr
                    key={`hdr-${type}`}
                    className="bg-zinc-900/20 border-t border-[var(--border)]"
                  >
                    <td
                      colSpan={5}
                      className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-zinc-500 font-medium"
                    >
                      {TYPE_LABEL[type] || type}
                    </td>
                  </tr>
                  {list.map((l) => (
                    <tr
                      key={l.code}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-4 py-1.5 font-mono text-zinc-500">
                        {l.code}
                      </td>
                      <td className="px-4 py-1.5 text-zinc-200">
                        <Link
                          href={`/journal?account_code=${l.code}&from=${from}&to=${to}`}
                          className="hover:text-emerald-300"
                        >
                          {l.name}
                        </Link>
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-zinc-300">
                        {l.debit_total_cents > 0
                          ? formatEUR(l.debit_total_cents)
                          : "—"}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono text-zinc-300">
                        {l.credit_total_cents > 0
                          ? formatEUR(l.credit_total_cents)
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-1.5 text-right font-mono ${
                          l.balance_cents > 0
                            ? "text-emerald-300"
                            : l.balance_cents < 0
                              ? "text-red-300"
                              : "text-zinc-500"
                        }`}
                      >
                        {l.balance_cents !== 0
                          ? formatEUR(Math.abs(l.balance_cents))
                          : "—"}
                        {l.balance_cents !== 0 && (
                          <span className="text-[9px] text-zinc-500 ml-1">
                            {l.balance_cents > 0 ? "D" : "C"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-700 bg-zinc-900/40">
              <td colSpan={2} className="px-4 py-2 font-semibold text-zinc-200">
                Totaal
              </td>
              <td className="px-4 py-2 text-right font-mono font-bold text-zinc-100">
                {formatEUR(report.debit_grand_total)}
              </td>
              <td className="px-4 py-2 text-right font-mono font-bold text-zinc-100">
                {formatEUR(report.credit_grand_total)}
              </td>
              <td
                className={`px-4 py-2 text-right text-[11px] ${
                  report.in_balance ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {report.in_balance ? "✓ In balans" : "⚠ Onbalans"}
              </td>
            </tr>
          </tfoot>
        </table></div>
      </section>
    </div>
  );
}
