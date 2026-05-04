import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  generateDebtorAging,
  generateCreditorAging,
  type AgingReport,
  type AgingRow,
} from "@/lib/reports/aging";
import { formatEUR, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<AgingRow["bucket"], string> = {
  current: "Niet vervallen",
  "30": "1-30 dagen",
  "60": "31-60 dagen",
  "90": "61-90 dagen",
  "90+": "> 90 dagen",
};

export default function AgingPage({
  searchParams,
}: {
  searchParams: { as_of?: string };
}) {
  const asOf = searchParams.as_of || new Date().toISOString().slice(0, 10);
  const debtors = generateDebtorAging(asOf);
  const creditors = generateCreditorAging(asOf);

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
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Aging — openstaande posten
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Peildatum {asOf}. Vorderingen op klanten en schulden aan
          leveranciers, gegroepeerd op leeftijd.
        </p>
      </header>

      <form className="flex gap-2 items-end">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Peildatum</span>
          <input
            type="date"
            name="as_of"
            defaultValue={asOf}
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

      <AgingSection
        title="Debiteuren — te ontvangen van klanten"
        report={debtors}
        partyLabel="Klant"
        linkPrefix="/invoices"
      />

      <AgingSection
        title="Crediteuren — te betalen aan leveranciers"
        report={creditors}
        partyLabel="Leverancier"
        linkPrefix="/purchase"
      />
    </div>
  );
}

function AgingSection({
  title,
  report,
  partyLabel,
  linkPrefix,
}: {
  title: string;
  report: AgingReport;
  partyLabel: string;
  linkPrefix: string;
}) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        <span className="font-mono text-sm text-zinc-300">
          {formatEUR(report.total_cents)}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-px bg-zinc-800 border-b border-[var(--border)]">
        {(Object.keys(report.by_bucket) as AgingRow["bucket"][]).map((b) => (
          <div key={b} className="bg-[var(--surface)] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {BUCKET_LABEL[b]}
            </p>
            <p
              className={`text-sm font-mono mt-0.5 ${
                b === "90+"
                  ? "text-red-300"
                  : b === "90"
                    ? "text-amber-300"
                    : "text-zinc-200"
              }`}
            >
              {formatEUR(report.by_bucket[b])}
            </p>
          </div>
        ))}
      </div>

      {report.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">
          Geen openstaande posten.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/20">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nummer</th>
              <th className="text-left px-3 py-2 font-medium">{partyLabel}</th>
              <th className="text-left px-3 py-2 font-medium w-28">Vervaldatum</th>
              <th className="text-right px-3 py-2 font-medium w-24">Dagen</th>
              <th className="text-right px-3 py-2 font-medium w-32">Bedrag</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-1.5 font-mono text-zinc-300">
                  <Link
                    href={`${linkPrefix}/${r.id}`}
                    className="hover:text-emerald-300"
                  >
                    {r.number}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-zinc-200">{r.party_name}</td>
                <td className="px-3 py-1.5 text-zinc-400 font-mono text-xs">
                  {formatDate(r.due_date)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right font-mono text-xs ${
                    r.days_overdue > 90
                      ? "text-red-300"
                      : r.days_overdue > 30
                        ? "text-amber-300"
                        : r.days_overdue > 0
                          ? "text-zinc-300"
                          : "text-zinc-500"
                  }`}
                >
                  {r.days_overdue > 0
                    ? `+${r.days_overdue}`
                    : r.days_overdue === 0
                      ? "vandaag"
                      : `${r.days_overdue}`}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                  {formatEUR(r.total_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
