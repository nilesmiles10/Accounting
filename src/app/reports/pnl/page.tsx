import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { generatePnL } from "@/lib/reports/pnl";
import { listCompanies } from "@/lib/companies";
import { formatEUR } from "@/lib/format";
import PnLPeriodPicker from "./PnLPeriodPicker";
import PnLCompanyPicker from "./PnLCompanyPicker";
import CoverageBanner from "@/components/CoverageBanner";

export const dynamic = "force-dynamic";

function defaultRange(year: number, quarter?: number): { from: string; to: string } {
  if (quarter && quarter >= 1 && quarter <= 4) {
    const start = (quarter - 1) * 3 + 1;
    const end = start + 2;
    const lastDay = new Date(Date.UTC(year, end, 0)).getUTCDate();
    return {
      from: `${year}-${String(start).padStart(2, "0")}-01`,
      to: `${year}-${String(end).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export default function PnLPage({
  searchParams,
}: {
  searchParams: {
    from?: string;
    to?: string;
    year?: string;
    q?: string;
    company?: string;
  };
}) {
  const year = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();
  const quarter = searchParams.q ? parseInt(searchParams.q) : undefined;
  const range = searchParams.from && searchParams.to
    ? { from: searchParams.from, to: searchParams.to }
    : defaultRange(year, quarter);

  const companies = listCompanies();
  const companyId = searchParams.company || null;
  const selectedCompany = companyId
    ? companies.find((c) => c.id === companyId)
    : null;

  const report = generatePnL(range.from, range.to, companyId);

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
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Winst-en-verlies
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Periode {report.from} t/m {report.to}
          {selectedCompany ? ` · Bedrijf: ${selectedCompany.name}` : " · Alle bedrijven"}
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <PnLPeriodPicker
          currentFrom={range.from}
          currentTo={range.to}
        />
        <PnLCompanyPicker
          companies={companies}
          currentCompanyId={companyId || ""}
        />
      </div>

      <CoverageBanner />

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <SectionHeader title="Omzet" amount={report.income_total} />
        {report.income.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500">Geen omzet in deze periode.</p>
        ) : (
          <Lines lines={report.income} />
        )}
      </section>

      {report.cost_of_sales.length > 0 && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <SectionHeader
            title="Kostprijs van de omzet"
            amount={report.cost_of_sales_total}
            negative
          />
          <Lines lines={report.cost_of_sales} />
        </section>
      )}

      <div className="bg-zinc-900/40 border border-[var(--border)] rounded-xl px-4 py-3 flex justify-between text-sm">
        <span className="text-zinc-300 font-medium">Bruto winst</span>
        <span className="font-mono text-zinc-100">
          {formatEUR(report.gross_profit_cents)}
        </span>
      </div>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <SectionHeader
          title="Bedrijfskosten"
          amount={report.expenses_total}
          negative
        />
        {report.expenses.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500">Geen kosten.</p>
        ) : (
          <Lines lines={report.expenses} />
        )}
      </section>

      <div
        className={`border rounded-xl px-4 py-4 flex justify-between text-base ${
          report.net_profit_cents >= 0
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-red-500/10 border-red-500/30"
        }`}
      >
        <span className="font-semibold text-zinc-100">Netto resultaat</span>
        <span
          className={`font-mono font-bold ${
            report.net_profit_cents >= 0
              ? "text-emerald-300"
              : "text-red-300"
          }`}
        >
          {formatEUR(report.net_profit_cents)}
        </span>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  amount,
  negative,
}: {
  title: string;
  amount: number;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-zinc-900/40">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <span
        className={`font-mono text-sm ${negative ? "text-red-300" : "text-emerald-300"}`}
      >
        {negative ? "-" : ""}
        {formatEUR(Math.abs(amount))}
      </span>
    </div>
  );
}

function Lines({
  lines,
}: {
  lines: Array<{ code: string; name: string; amount_cents: number }>;
}) {
  return (
    <table className="w-full text-sm">
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
    </table>
  );
}
