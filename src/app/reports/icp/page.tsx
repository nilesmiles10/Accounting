import Link from "next/link";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import { generateIcpReport } from "@/lib/reports/icp";
import { quarterRange } from "@/lib/reports/vat";
import { formatEUR } from "@/lib/format";

export const dynamic = "force-dynamic";

const VALID_EU_CODES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR",
  "HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
]);

export default function IcpPage({
  searchParams,
}: {
  searchParams: { year?: string; q?: string };
}) {
  const year = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();
  const q = searchParams.q
    ? parseInt(searchParams.q)
    : Math.ceil((new Date().getMonth() + 1) / 3);
  const safeQ = Math.max(1, Math.min(4, q)) as 1 | 2 | 3 | 4;
  const range = quarterRange(year, safeQ);
  const report = generateIcpReport(range.from, range.to);

  const incomplete = report.rows.filter(
    (r) => !r.vat_number || !VALID_EU_CODES.has(r.country_code),
  );

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
          ICP-opgave
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {year} Q{safeQ} — {report.from} t/m {report.to}. Per EU-klant met
          verlegde BTW totaalbedrag (excl. BTW). Wordt los van de gewone
          BTW-aangifte ingediend bij Belastingdienst.
        </p>
      </header>

      {incomplete.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 text-sm">
          <p className="text-amber-300 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {incomplete.length} klant
            {incomplete.length > 1 ? "en" : ""} met onvolledig BTW-nummer
          </p>
          <p className="text-zinc-400 text-xs mt-1">
            Klantgegevens aanvullen voordat je indient — Belastingdienst
            valideert het BTW-nummer in VIES en wijst de aangifte af bij
            een ongeldig nummer.
          </p>
        </div>
      )}

      {report.rows.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center text-sm text-zinc-500">
          Geen leveringen aan EU-klanten met verlegde BTW in dit kwartaal.
        </div>
      ) : (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-12">Land</th>
                <th className="text-left px-3 py-2 font-medium w-40">BTW-nummer</th>
                <th className="text-left px-3 py-2 font-medium">Klant</th>
                <th className="text-center px-3 py-2 font-medium w-12">Type</th>
                <th className="text-right px-3 py-2 font-medium w-32">Bedrag (excl)</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => {
                const isInvalid =
                  !r.vat_number || !VALID_EU_CODES.has(r.country_code);
                return (
                  <tr key={r.client_id} className="border-t border-[var(--border)]">
                    <td
                      className={`px-3 py-1.5 font-mono ${
                        isInvalid ? "text-amber-300" : "text-zinc-300"
                      }`}
                    >
                      {r.country_code || "??"}
                    </td>
                    <td
                      className={`px-3 py-1.5 font-mono text-xs ${
                        isInvalid ? "text-amber-300" : "text-zinc-300"
                      }`}
                    >
                      {r.vat_number || "ontbreekt"}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-200">
                      <Link
                        href={`/clients/${r.client_id}`}
                        className="hover:text-emerald-300"
                      >
                        {r.client_name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-center text-zinc-500 text-xs">
                      {r.service_or_goods}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-200">
                      {formatEUR(r.total_cents)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-zinc-700 bg-zinc-900/40">
                <td colSpan={4} className="px-3 py-2 font-semibold text-zinc-200">
                  Totaal
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-zinc-100">
                  {formatEUR(report.total_cents)}
                </td>
              </tr>
            </tbody>
          </table></div>
        </section>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm text-zinc-400 space-y-2">
        <p className="font-semibold text-zinc-200">Indienen bij Belastingdienst</p>
        <p>
          Open Mijn Belastingdienst Zakelijk → ICP-opgave en typ deze
          regels over. Validatie van BTW-nummers via VIES gebeurt aan
          de zijde van Belastingdienst.
        </p>
        <a
          href="https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/zakendoen_binnen_de_eu/btw_aangeven_bij_zakendoen_binnen_de_eu/opgaaf_intracommunautaire_prestaties"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300"
        >
          <ExternalLink className="w-4 h-4" />
          ICP-opgave Belastingdienst
        </a>
      </div>
    </div>
  );
}
