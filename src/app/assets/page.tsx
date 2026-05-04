import Link from "next/link";
import { ArrowLeft, Plus, Package, CheckCircle2, XCircle } from "lucide-react";
import { listAssets, catchupAll } from "@/lib/assets";
import { formatEUR, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  active: { text: "Actief", cls: "bg-emerald-500/15 text-emerald-300" },
  fully_depreciated: {
    text: "Volledig afgeschreven",
    cls: "bg-zinc-700 text-zinc-300",
  },
  disposed: { text: "Afgestoten", cls: "bg-zinc-800 text-zinc-500" },
};

const CATEGORY_LABEL: Record<string, string> = {
  inventaris: "Inventaris",
  ict: "ICT",
  machines: "Machines",
  voertuigen: "Voertuigen",
  overig: "Overig",
};

export default function AssetsPage({
  searchParams,
}: {
  searchParams: { status?: "active" | "fully_depreciated" | "disposed" };
}) {
  // Catch-up afschrijvingen draaien bij elk page-load — zorgt dat
  // boekingen actueel zijn zonder dat we een aparte cron hoeven.
  const catchup = catchupAll();
  const status = searchParams.status;
  const assets = listAssets({ status });

  const totalPurchase = assets.reduce((s, a) => s + a.purchase_amount_cents, 0);
  const totalBookValue = assets.reduce((s, a) => s + a.book_value_cents, 0);
  const totalDepreciated = assets.reduce(
    (s, a) => s + a.total_depreciated_cents,
    0,
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Overzicht
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1 inline-flex items-center gap-2">
            <Package className="w-5 h-5" />
            Vaste activa
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Geactiveerde investeringen + lineaire afschrijving. Maand-
            boekingen worden automatisch ingelopen wanneer deze pagina
            geopend wordt.
          </p>
        </div>
        <Link
          href="/assets/new"
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Nieuw activum
        </Link>
      </header>

      {catchup.posted > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl px-4 py-2 text-sm text-emerald-200">
          ✓ {catchup.posted} maand-afschrijving
          {catchup.posted === 1 ? "" : "en"} bijgeboekt over {catchup.total}{" "}
          actieve activa
        </div>
      )}

      <section className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Aanschafwaarde"
          value={formatEUR(totalPurchase)}
        />
        <SummaryCard
          label="Cumulatief afgeschreven"
          value={formatEUR(totalDepreciated)}
          tone="warning"
        />
        <SummaryCard
          label="Boekwaarde"
          value={formatEUR(totalBookValue)}
          tone="positive"
        />
      </section>

      <div className="flex gap-2 text-xs">
        <FilterTab href="/assets" active={!status}>
          Alle
        </FilterTab>
        <FilterTab
          href="/assets?status=active"
          active={status === "active"}
        >
          Actief
        </FilterTab>
        <FilterTab
          href="/assets?status=fully_depreciated"
          active={status === "fully_depreciated"}
        >
          Afgeschreven
        </FilterTab>
        <FilterTab
          href="/assets?status=disposed"
          active={status === "disposed"}
        >
          Afgestoten
        </FilterTab>
      </div>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        {assets.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            <Package className="w-8 h-8 mx-auto mb-3 text-zinc-700" />
            <p>Geen activa in deze view.</p>
            <p className="text-xs mt-1">
              Voeg een laptop, machine of meubilair toe via Nieuw activum.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/40">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-24">Code</th>
                <th className="text-left px-4 py-2 font-medium">Naam</th>
                <th className="text-left px-4 py-2 font-medium w-24">Categorie</th>
                <th className="text-left px-4 py-2 font-medium w-28">Aanschaf</th>
                <th className="text-right px-4 py-2 font-medium w-28">
                  Aanschafprijs
                </th>
                <th className="text-right px-4 py-2 font-medium w-28">
                  Boekwaarde
                </th>
                <th className="text-right px-4 py-2 font-medium w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const s = STATUS_LABEL[a.status] || STATUS_LABEL.active;
                return (
                  <tr
                    key={a.id}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                      {a.code}
                    </td>
                    <td className="px-4 py-2 text-zinc-200">
                      <Link
                        href={`/assets/${a.id}`}
                        className="hover:text-emerald-300"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {CATEGORY_LABEL[a.category] || a.category}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400 font-mono">
                      {formatDate(a.purchase_date)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-300">
                      {formatEUR(a.purchase_amount_cents)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-200">
                      {formatEUR(a.book_value_cents)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${s?.cls}`}
                      >
                        {s?.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-zinc-500 space-y-2">
        <p className="font-semibold text-zinc-300 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Wanneer een asset toevoegen?
        </p>
        <p>
          Aanschaf &gt; €450 netto → fiscaal verplicht activeren. Lineair
          afschrijven over: ICT 3 jaar, inventaris/voertuigen 5 jaar,
          machines 7-10 jaar (kies in formulier — defaults zijn marktconform).
        </p>
        <p className="inline-flex items-center gap-1.5 text-zinc-600">
          <XCircle className="w-3.5 h-3.5" />
          Aanschaf &lt; €450? Boek direct als kosten op een 4xxx-rekening,
          niet als activum.
        </p>
      </div>
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
      <p className={`text-xl font-bold font-mono mt-1 ${cls}`}>{value}</p>
    </div>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full border ${
        active
          ? "bg-zinc-800 border-zinc-600 text-zinc-100"
          : "border-[var(--border)] text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </Link>
  );
}
