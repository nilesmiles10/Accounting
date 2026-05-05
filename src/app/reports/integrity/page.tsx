import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { checkNumberingIntegrity } from "@/lib/reports/numbering";
import { listVatSubmissions } from "@/lib/ledger/periods";
import { formatEUR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function IntegrityPage() {
  const numbering = checkNumberingIntegrity();
  const submissions = listVatSubmissions();

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
          Integriteit & archief
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Sanity-checks voor de boekhouding: doorlopende factuur-
          nummering en historie van ingediende BTW-aangiftes.
        </p>
      </header>

      {/* Numbering integrity */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-zinc-900/40 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">
              Factuurnummering
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Belastingdienst-eis: per boekjaar per bedrijf doorlopend
              zonder gaten. Gecancelde facturen mogen blijven bestaan.
            </p>
          </div>
          {numbering.total_gaps === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Geen gaten
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              {numbering.total_gaps} aandachtspunt
              {numbering.total_gaps > 1 ? "en" : ""}
            </span>
          )}
        </div>

        {numbering.series.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500 text-center">
            Geen gefinaliseerde facturen — niets te checken.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {numbering.series.map((s) => (
              <div
                key={`${s.company_id}-${s.year}`}
                className="px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-zinc-200">
                      {s.company_name} · {s.year}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {s.prefix}
                      {s.year}-{String(s.min_seq).padStart(4, "0")} t/m{" "}
                      {s.prefix}
                      {s.year}-{String(s.max_seq).padStart(4, "0")} ·{" "}
                      {s.total} facturen
                      {s.cancelled_count > 0 &&
                        `, ${s.cancelled_count} geannuleerd`}
                    </p>
                  </div>
                  {s.gaps.filter((g) => g.status === "missing").length === 0 ? (
                    <span className="text-xs text-emerald-400">✓</span>
                  ) : (
                    <span className="text-xs text-amber-400">
                      {s.gaps.filter((g) => g.status === "missing").length} gat(en)
                    </span>
                  )}
                </div>
                {s.gaps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.gaps.map((g) => (
                      <span
                        key={g.expected_seq}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          g.status === "missing"
                            ? "bg-red-500/15 text-red-300"
                            : "bg-zinc-700 text-zinc-400"
                        }`}
                        title={
                          g.status === "missing"
                            ? "Geen factuur gevonden — verklaar dit gat"
                            : "Geannuleerd — nummer mag niet hergebruikt"
                        }
                      >
                        {g.prefix}
                        {g.year}-{String(g.expected_seq).padStart(4, "0")}
                        {g.status === "cancelled" ? " ✕" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BTW submissions archief */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-zinc-900/40">
          <h2 className="text-sm font-semibold text-zinc-200">
            BTW-aangifte archief
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Ingediende kwartalen met saldo en datum. Het kwartaal is
            afgesloten — late mutaties komen via suppletie.
          </p>
        </div>

        {submissions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500 text-center">
            Nog geen kwartalen afgesloten.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/20">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-24">Periode</th>
                <th className="text-left px-4 py-2 font-medium w-40">Ingediend op</th>
                <th className="text-right px-4 py-2 font-medium">Te betalen / retour</th>
                <th className="text-center px-4 py-2 font-medium w-20">Boeking</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const submitted = new Date(s.submitted_at);
                return (
                  <tr
                    key={`${s.year}-${s.quarter}`}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-4 py-2 font-mono text-zinc-200">
                      <Link
                        href={`/reports/vat?year=${s.year}&q=${s.quarter}`}
                        className="hover:text-emerald-300 inline-flex items-center gap-1.5"
                      >
                        <Lock className="w-3 h-3 text-zinc-500" />
                        {s.year}-Q{s.quarter}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-xs">
                      {submitted.toLocaleDateString("nl-NL")}{" "}
                      <span className="text-zinc-600">
                        {submitted.toLocaleTimeString("nl-NL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${
                        s.to_pay_cents >= 0 ? "text-red-300" : "text-emerald-300"
                      }`}
                    >
                      {s.to_pay_cents >= 0 ? "" : "-"}
                      {formatEUR(Math.abs(s.to_pay_cents))}
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-zinc-500">
                      {s.payment_journal_id ? (
                        <Link
                          href={`/journal?source_type=vat_submission`}
                          className="hover:text-emerald-300"
                        >
                          ✓
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
