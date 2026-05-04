"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type { InvoiceListItem } from "@/lib/invoices";
import type { Company } from "@/lib/companies";
import { formatEUR, formatDate } from "@/lib/format";
import ResponsiveTable, {
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
  sent: { text: "Verstuurd", cls: "bg-indigo-500/15 text-indigo-300" },
  paid: { text: "Betaald", cls: "bg-emerald-500/15 text-emerald-300" },
  overdue: { text: "Te laat", cls: "bg-red-500/15 text-red-300" },
  cancelled: { text: "Geannuleerd", cls: "bg-zinc-800 text-zinc-500" },
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full ${
        STATUS_LABEL[status]?.cls || "bg-zinc-800"
      }`}
    >
      {STATUS_LABEL[status]?.text || status}
    </span>
  );
}

export default function InvoicesList({
  invoices,
  companies,
  years,
  currentStatus,
  currentCompanyId,
  currentYear,
}: {
  invoices: InvoiceListItem[];
  companies: Company[];
  years: string[];
  currentStatus: string;
  currentCompanyId: string;
  currentYear: string;
}) {
  const router = useRouter();

  function updateFilter(
    key: "status" | "company_id" | "year",
    value: string,
  ) {
    const params = new URLSearchParams();
    const st = key === "status" ? value : currentStatus;
    const co = key === "company_id" ? value : currentCompanyId;
    const yr = key === "year" ? value : currentYear;
    if (st) params.set("status", st);
    if (co) params.set("company_id", co);
    if (yr) params.set("year", yr);
    const qs = params.toString();
    router.push(qs ? `/invoices?${qs}` : "/invoices");
  }

  // Audit 2026-05-03: migrated to ResponsiveTable. Below `md` the rows
  // render as stacked cards (Nummer + Status as the headline, rest as
  // labeled fields) instead of horizontally-scrolled tiny table cells.
  // At `md+` the layout is identical to before. The whole row is now
  // clickable for navigation (was a single column-link before).
  const columns: ResponsiveColumn<InvoiceListItem>[] = [
    {
      key: "number",
      label: "Nummer",
      fullWidthOnMobile: true,
      render: (inv) => (
        <div className="flex items-center justify-between gap-2">
          <span className="text-emerald-400 hover:text-emerald-300 font-mono text-xs inline-flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {inv.status === "draft" ? "Concept" : inv.number}
          </span>
          <span className="md:hidden">
            <StatusBadge status={inv.status} />
          </span>
        </div>
      ),
    },
    {
      key: "company_name",
      label: "Van",
      className: "text-zinc-300",
      render: (inv) => inv.company_name,
    },
    {
      key: "client_name",
      label: "Klant",
      className: "text-zinc-300",
      render: (inv) => inv.client_name,
    },
    {
      key: "issue_date",
      label: "Datum",
      className: "text-zinc-500 text-xs",
      render: (inv) => formatDate(inv.issue_date, "nl"),
    },
    {
      key: "total",
      label: "Bedrag",
      className: "text-right font-mono text-zinc-200",
      render: (inv) => formatEUR(inv.total_cents),
    },
    {
      key: "status",
      label: "Status",
      className: "text-center",
      // Hidden on mobile because the badge is shown inline in the
      // headline row above (avoids duplicate Status: Status badge).
      hideOnMobile: true,
      render: (inv) => <StatusBadge status={inv.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <select
          value={currentStatus}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          aria-label="Filter op status"
        >
          <option value="">Alle statussen</option>
          <option value="open">Open (verstuurd + te laat)</option>
          <option value="draft">Concept</option>
          <option value="sent">Verstuurd</option>
          <option value="paid">Betaald</option>
          <option value="overdue">Te laat</option>
          <option value="cancelled">Geannuleerd</option>
        </select>
        <select
          value={currentCompanyId}
          onChange={(e) => updateFilter("company_id", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          aria-label="Filter op bedrijf"
        >
          <option value="">Alle bedrijven</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={currentYear}
          onChange={(e) => updateFilter("year", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          aria-label="Filter op jaar"
        >
          <option value="">Alle jaren</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <ResponsiveTable
        rows={invoices}
        columns={columns}
        rowKey={(inv) => inv.id}
        onRowClick={(inv) => router.push(`/invoices/${inv.id}`)}
        emptyMessage="Geen facturen gevonden."
      />
    </div>
  );
}
