import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Scale,
  Receipt,
  Columns3,
  Clock,
  Globe,
  ShieldCheck,
  Download,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function ReportsHubPage() {
  const year = new Date().getFullYear();
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Overzicht
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Rapportages</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Live rapporten op basis van geboekte journaalposten.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReportCard
          href={`/reports/pnl?year=${year}`}
          icon={TrendingUp}
          title="Winst-en-verlies"
          desc="Omzet, kosten en resultaat per periode"
        />
        <ReportCard
          href={`/reports/balance`}
          icon={Scale}
          title="Balans"
          desc="Activa, passiva en eigen vermogen"
        />
        <ReportCard
          href={`/reports/vat?year=${year}&q=${Math.ceil((new Date().getMonth() + 1) / 3)}`}
          icon={Receipt}
          title="BTW-aangifte"
          desc="Rubrieken voor Mijn Belastingdienst"
        />
        <ReportCard
          href={`/reports/trial-balance?year=${year}`}
          icon={Columns3}
          title="Proefbalans"
          desc="Kolommenbalans — debet/credit per rekening"
        />
        <ReportCard
          href={`/reports/aging`}
          icon={Clock}
          title="Aging"
          desc="Openstaande debiteuren en crediteuren"
        />
        <ReportCard
          href={`/reports/icp?year=${year}&q=${Math.ceil((new Date().getMonth() + 1) / 3)}`}
          icon={Globe}
          title="ICP-opgave"
          desc="Per EU-klant — verlegde BTW per kwartaal"
        />
        <ReportCard
          href={`/reports/integrity`}
          icon={ShieldCheck}
          title="Integriteit"
          desc="Nummer-gaten + BTW-archief"
        />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200 inline-flex items-center gap-2">
            <Download className="w-4 h-4" />
            XAF auditfile export
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            XML Auditfile Financieel 3.2 — standaard die Belastingdienst-
            controleurs vragen bij audit. Bevat compleet rekeningschema +
            klanten + leveranciers + alle journaal-boekingen voor een fiscaal
            jaar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[year, year - 1, year - 2].map((y) => (
            <a
              key={y}
              href={`/api/xaf?year=${y}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              XAF {y}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/40 transition-colors"
    >
      <Icon className="w-5 h-5 text-emerald-400 mb-2" />
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <p className="text-xs text-zinc-500 mt-1">{desc}</p>
    </Link>
  );
}
