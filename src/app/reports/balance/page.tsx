import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { generateBalance } from "@/lib/reports/balance";
import { formatEUR } from "@/lib/format";
import BalanceDatePicker from "./BalanceDatePicker";
import CoverageBanner from "@/components/CoverageBanner";

export const dynamic = "force-dynamic";

export default function BalancePage({
  searchParams,
}: {
  searchParams: { as_of?: string };
}) {
  const asOf = searchParams.as_of || new Date().toISOString().slice(0, 10);
  const report = generateBalance(asOf);

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
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Balans</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Peildatum {report.as_of}
        </p>
      </header>

      <BalanceDatePicker currentAsOf={report.as_of} />

      <CoverageBanner />

      {report.imbalance_cents !== 0 ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-sm text-red-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Onbalans: <span className="font-mono">{formatEUR(report.imbalance_cents)}</span>{" "}
            — er klopt iets niet in de boekingen.
          </span>
        </div>
      ) : (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2 text-sm text-emerald-200">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Balanceert op de cent.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[var(--border)] bg-zinc-900/40 flex justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Activa</h2>
            <span className="font-mono text-sm text-zinc-300">
              {formatEUR(report.assets_total)}
            </span>
          </header>
          <Lines lines={report.assets} />
        </section>

        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[var(--border)] bg-zinc-900/40 flex justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              Passiva + Eigen vermogen
            </h2>
            <span className="font-mono text-sm text-zinc-300">
              {formatEUR(report.total_passiva_cents)}
            </span>
          </header>
          {report.liabilities.length > 0 && (
            <>
              <p className="px-4 pt-2 text-[10px] text-zinc-500 uppercase tracking-wider">
                Verplichtingen
              </p>
              <Lines lines={report.liabilities} />
            </>
          )}
          <p className="px-4 pt-3 text-[10px] text-zinc-500 uppercase tracking-wider border-t border-[var(--border)]">
            Eigen vermogen
          </p>
          {report.equity_lines.length > 0 && (
            <Lines lines={report.equity_lines} />
          )}
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-[var(--border)]">
                <td className="px-4 py-1.5 font-mono text-zinc-500 w-20">—</td>
                <td className="px-4 py-1.5 text-zinc-200">
                  Reserves (winst tot peildatum)
                </td>
                <td
                  className={`px-4 py-1.5 text-right font-mono ${
                    report.retained_earnings_cents >= 0
                      ? "text-zinc-300"
                      : "text-red-300"
                  }`}
                >
                  {formatEUR(report.retained_earnings_cents)}
                </td>
              </tr>
            </tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}

function Lines({
  lines,
}: {
  lines: Array<{ code: string; name: string; amount_cents: number }>;
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
      <tbody>
        {lines.map((l) => (
          <tr key={l.code} className="border-t border-[var(--border)]">
            <td className="px-4 py-1.5 font-mono text-zinc-500 w-20">{l.code}</td>
            <td className="px-4 py-1.5 text-zinc-200">
              <Link
                href={`/journal?account_code=${l.code}`}
                className="hover:text-emerald-300"
              >
                {l.name}
              </Link>
            </td>
            <td className="px-4 py-1.5 text-right font-mono text-zinc-300">
              {formatEUR(l.amount_cents)}
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
