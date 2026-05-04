import { Info } from "lucide-react";
import { getCoverageInfo } from "@/lib/reports/coverage";
import { formatDate } from "@/lib/format";

/**
 * Server-component banner die op rapport-pages waarschuwt voor
 * facturen/inkopen zonder journaalpost (bv. gefinaliseerd voor fase 3).
 */
export default function CoverageBanner() {
  const info = getCoverageInfo();
  const missing =
    info.invoices_without_journal + info.purchases_without_journal;
  if (missing === 0 && !info.first_journal_date) return null;

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-3 text-xs">
      <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="text-zinc-300 space-y-0.5">
        {info.first_journal_date && (
          <p>
            Boekingen vanaf{" "}
            <span className="font-mono text-zinc-100">
              {formatDate(info.first_journal_date)}
            </span>
            .
          </p>
        )}
        {missing > 0 && (
          <p className="text-amber-200">
            {info.invoices_without_journal} factu(u)r
            {info.invoices_without_journal === 1 ? "" : "en"}
            {info.purchases_without_journal > 0
              ? ` + ${info.purchases_without_journal} inkop(en)`
              : ""}{" "}
            zonder journaalpost (gefinaliseerd vóór de boekhoudkern). Niet
            zichtbaar in dit rapport.
          </p>
        )}
      </div>
    </div>
  );
}
