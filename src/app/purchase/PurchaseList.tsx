"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type { PurchaseListItem } from "@/lib/purchase-invoices";
import type { Company } from "@/lib/companies";
import type { Supplier } from "@/lib/suppliers";
import { formatEUR, formatDate } from "@/lib/format";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
  review: { text: "Review", cls: "bg-amber-500/15 text-amber-300" },
  approved: { text: "Goedgekeurd", cls: "bg-indigo-500/15 text-indigo-300" },
  paid: { text: "Betaald", cls: "bg-emerald-500/15 text-emerald-300" },
  cancelled: { text: "Geannuleerd", cls: "bg-zinc-800 text-zinc-500" },
};

export default function PurchaseList({
  invoices,
  companies,
  suppliers,
  currentStatus,
  currentCompanyId,
  currentSupplierId,
}: {
  invoices: PurchaseListItem[];
  companies: Company[];
  suppliers: Supplier[];
  currentStatus: string;
  currentCompanyId: string;
  currentSupplierId: string;
}) {
  const router = useRouter();

  function updateFilter(
    key: "status" | "company_id" | "supplier_id",
    value: string,
  ) {
    const params = new URLSearchParams();
    const st = key === "status" ? value : currentStatus;
    const co = key === "company_id" ? value : currentCompanyId;
    const sup = key === "supplier_id" ? value : currentSupplierId;
    if (st) params.set("status", st);
    if (co) params.set("company_id", co);
    if (sup) params.set("supplier_id", sup);
    const qs = params.toString();
    router.push(qs ? `/purchase?${qs}` : "/purchase");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={currentStatus}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        >
          <option value="">Alle statussen</option>
          <option value="draft">Concept</option>
          <option value="review">Review</option>
          <option value="approved">Goedgekeurd</option>
          <option value="paid">Betaald</option>
          <option value="cancelled">Geannuleerd</option>
        </select>
        <select
          value={currentCompanyId}
          onChange={(e) => updateFilter("company_id", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        >
          <option value="">Alle bedrijven</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={currentSupplierId}
          onChange={(e) => updateFilter("supplier_id", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        >
          <option value="">Alle leveranciers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-500 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          Geen inkoopfacturen.
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-xs text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Factuur</th>
                <th className="text-left px-4 py-2 font-medium">Leverancier</th>
                <th className="text-left px-4 py-2 font-medium">Voor</th>
                <th className="text-left px-4 py-2 font-medium">Datum</th>
                <th className="text-right px-4 py-2 font-medium">Bedrag</th>
                <th className="text-center px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-[var(--border)] hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => router.push(`/purchase/${inv.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <span className="text-emerald-400 font-mono text-xs inline-flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {inv.supplier_invoice_number || "concept"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {inv.supplier_name || (
                      <span className="text-zinc-500 italic">geen koppeling</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{inv.company_name}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">
                    {inv.issue_date ? formatDate(inv.issue_date, "nl") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-200">
                    {formatEUR(inv.total_cents)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        STATUS_LABEL[inv.status]?.cls || "bg-zinc-800"
                      }`}
                    >
                      {STATUS_LABEL[inv.status]?.text || inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
