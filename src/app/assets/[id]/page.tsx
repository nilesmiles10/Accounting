import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import {
  getAsset,
  listDepreciations,
  catchupDepreciation,
} from "@/lib/assets";
import { formatEUR, formatDate } from "@/lib/format";
import AssetActions from "./AssetActions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  active: { text: "Actief", cls: "bg-emerald-500/15 text-emerald-300" },
  fully_depreciated: {
    text: "Volledig afgeschreven",
    cls: "bg-zinc-700 text-zinc-300",
  },
  disposed: { text: "Afgestoten", cls: "bg-zinc-800 text-zinc-500" },
};

export default function AssetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Catch-up bij elke pageload zodat boekingen actueel zijn
  catchupDepreciation(params.id);

  const asset = getAsset(params.id);
  if (!asset) notFound();
  const depreciations = listDepreciations(asset.id);

  const status = STATUS_LABEL[asset.status] || STATUS_LABEL.active;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/assets"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Vaste activa
        </Link>
        <div className="flex items-start justify-between gap-3 mt-1 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              <span className="font-mono text-zinc-500">{asset.code}</span>{" "}
              {asset.name}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {asset.category} · aanschaf {formatDate(asset.purchase_date)} ·
              levensduur {asset.useful_life_years} jaar
            </p>
            {asset.description && (
              <p className="text-sm text-zinc-400 mt-2">{asset.description}</p>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full ${status?.cls}`}
          >
            {status?.text}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Aanschafprijs"
          value={formatEUR(asset.purchase_amount_cents)}
        />
        <SummaryCard
          label="Cumulatief afgeschreven"
          value={formatEUR(asset.total_depreciated_cents)}
          tone="warning"
        />
        <SummaryCard
          label="Boekwaarde"
          value={formatEUR(asset.book_value_cents)}
          tone="positive"
        />
        <SummaryCard
          label="Resterend (maanden)"
          value={String(asset.months_remaining)}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            Maandelijkse afschrijving
          </p>
          <p className="text-2xl font-bold text-zinc-100 font-mono">
            {formatEUR(asset.monthly_depreciation_cents)}
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            Per jaar:{" "}
            <span className="font-mono text-zinc-300">
              {formatEUR(asset.monthly_depreciation_cents * 12)}
            </span>
          </p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            Boekingen
          </p>
          <ul className="text-xs text-zinc-400 space-y-0.5 mt-1">
            <li>
              <span className="font-mono text-zinc-500">D</span>{" "}
              {asset.expense_account_code} Afschrijvingskosten
            </li>
            <li>
              <span className="font-mono text-zinc-500">C</span>{" "}
              {asset.depreciation_account_code} Cum. afschrijving
            </li>
            {asset.residual_value_cents > 0 && (
              <li className="text-zinc-500 mt-1">
                Restwaarde: {formatEUR(asset.residual_value_cents)}
              </li>
            )}
          </ul>
        </div>
      </section>

      <AssetActions asset={asset} />

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-zinc-900/40">
          <h2 className="text-sm font-semibold text-zinc-200">
            Afschrijvings-historie
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Per maand 1 boeking. {depreciations.length} maand
            {depreciations.length === 1 ? "" : "en"} gedraaid.
          </p>
        </div>
        {depreciations.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            Nog geen afschrijvingen geboekt. De eerste maand-afschrijving
            volgt op de eerste hele maand na aanschaf.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/20">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-32">Periode</th>
                <th className="text-right px-4 py-2 font-medium">Bedrag</th>
                <th className="text-right px-4 py-2 font-medium">Geboekt op</th>
                <th className="text-right px-4 py-2 font-medium">Journaal</th>
              </tr>
            </thead>
            <tbody>
              {depreciations.map((d) => (
                <tr key={d.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-1.5 font-mono text-zinc-300 text-xs">
                    {d.period_year}-{String(d.period_month).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono text-zinc-200">
                    {formatEUR(d.amount_cents)}
                  </td>
                  <td className="px-4 py-1.5 text-right text-xs text-zinc-500">
                    {new Date(d.posted_at).toLocaleDateString("nl-NL")}
                  </td>
                  <td className="px-4 py-1.5 text-right text-xs">
                    {d.journal_entry_id ? (
                      <Link
                        href={`/journal?source_type=manual`}
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        →
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning";
}) {
  const cls =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : "text-zinc-100";
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`text-lg font-bold font-mono mt-1 ${cls}`}>{value}</p>
    </div>
  );
}
