import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { generateVatReport, quarterRange } from "@/lib/reports/vat";
import {
  isQuarterClosed,
  getVatSubmission,
  type Quarter,
} from "@/lib/ledger/periods";
import { formatEUR } from "@/lib/format";
import VatPicker from "./VatPicker";
import VatSubmitPanel from "./VatSubmitPanel";
import CoverageBanner from "@/components/CoverageBanner";

export const dynamic = "force-dynamic";

export default function VatPage({
  searchParams,
}: {
  searchParams: { year?: string; q?: string; from?: string; to?: string };
}) {
  const year = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();
  const q = searchParams.q ? parseInt(searchParams.q) : Math.ceil((new Date().getMonth() + 1) / 3);

  const safeQ = Math.max(1, Math.min(4, q)) as Quarter;
  const range =
    searchParams.from && searchParams.to
      ? { from: searchParams.from, to: searchParams.to }
      : quarterRange(year, safeQ);

  const report = generateVatReport(range.from, range.to);
  const usingQuarter = !searchParams.from && !searchParams.to;
  const closed = usingQuarter ? isQuarterClosed(year, safeQ) : false;
  const submission = usingQuarter ? getVatSubmission(year, safeQ) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <Link
          href="/reports"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Rapportages
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">BTW-aangifte</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Periode {report.from} t/m {report.to}
        </p>
      </header>

      <VatPicker
        currentYear={year}
        currentQuarter={q}
      />

      <CoverageBanner />

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
          <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium w-16">Rubriek</th>
              <th className="text-left px-4 py-2 font-medium">Omschrijving</th>
              <th className="text-right px-4 py-2 font-medium w-32">Grondslag</th>
              <th className="text-right px-4 py-2 font-medium w-32">BTW</th>
            </tr>
          </thead>
          <tbody>
            {report.rubrics.map((r) => (
              <tr key={r.rubric} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-mono text-zinc-400">{r.rubric}</td>
                <td className="px-4 py-2 text-zinc-200">{r.label}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-300">
                  {formatEUR(r.base_cents)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-zinc-300">
                  {r.vat_cents !== 0 ? formatEUR(r.vat_cents) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <section
        className={`border rounded-xl px-4 py-4 flex justify-between items-center text-base ${
          report.to_pay_cents >= 0
            ? "bg-red-500/5 border-red-500/30"
            : "bg-emerald-500/5 border-emerald-500/30"
        }`}
      >
        <div>
          <p className="font-semibold text-zinc-100">
            {report.to_pay_cents >= 0
              ? "Te betalen aan Belastingdienst"
              : "Te ontvangen van Belastingdienst"}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            5g — Saldo over deze periode
          </p>
        </div>
        <span
          className={`font-mono font-bold text-lg ${
            report.to_pay_cents >= 0 ? "text-red-300" : "text-emerald-300"
          }`}
        >
          {formatEUR(Math.abs(report.to_pay_cents))}
        </span>
      </section>

      {usingQuarter && (
        <VatSubmitPanel
          year={year}
          quarter={safeQ}
          toPayCents={report.to_pay_cents}
          isClosed={closed}
          submission={submission}
        />
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm text-zinc-400 space-y-2">
        <p className="font-semibold text-zinc-200">Indienen bij Belastingdienst</p>
        <p>
          Open Mijn Belastingdienst Zakelijk en typ deze cijfers over in de
          aangifte voor het kwartaal.
        </p>
        <a
          href="https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/ondernemers/btw_aangifte_doen"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300"
        >
          <ExternalLink className="w-4 h-4" />
          Mijn Belastingdienst Zakelijk
        </a>
      </div>
    </div>
  );
}
