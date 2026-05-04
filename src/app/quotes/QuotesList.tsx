"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type { QuoteListItem } from "@/lib/quotes";
import type { Company } from "@/lib/companies";
import { formatEUR, formatDate } from "@/lib/format";
import ResponsiveTable, {
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
  sent: { text: "Verzonden", cls: "bg-indigo-500/15 text-indigo-300" },
  accepted: { text: "Geaccepteerd", cls: "bg-emerald-500/15 text-emerald-300" },
  rejected: { text: "Afgewezen", cls: "bg-red-500/15 text-red-300" },
  expired: { text: "Verlopen", cls: "bg-amber-500/15 text-amber-300" },
  converted: { text: "Omgezet", cls: "bg-zinc-800 text-zinc-400" },
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

export default function QuotesList({
  quotes,
  companies,
  years,
  currentStatus,
  currentCompanyId,
  currentYear,
}: {
  quotes: QuoteListItem[];
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
    router.push(qs ? `/quotes?${qs}` : "/quotes");
  }

  // Same shape as InvoicesList — see there for the mobile-card design
  // rationale. Status badge inline next to the Nummer headline; the
  // separate Status column is hidden below md to avoid duplication.
  const columns: ResponsiveColumn<QuoteListItem>[] = [
    {
      key: "number",
      label: "Nummer",
      fullWidthOnMobile: true,
      render: (q) => (
        <div className="flex items-center justify-between gap-2">
          <span className="text-emerald-400 hover:text-emerald-300 font-mono text-xs inline-flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {q.status === "draft" ? "Concept" : q.number}
          </span>
          <span className="md:hidden">
            <StatusBadge status={q.status} />
          </span>
        </div>
      ),
    },
    {
      key: "company_name",
      label: "Van",
      className: "text-zinc-300",
      render: (q) => q.company_name,
    },
    {
      key: "client_name",
      label: "Klant",
      className: "text-zinc-300",
      render: (q) => q.client_name,
    },
    {
      key: "issue_date",
      label: "Datum",
      className: "text-zinc-500 text-xs",
      render: (q) => formatDate(q.issue_date, "nl"),
    },
    {
      key: "valid_until_date",
      label: "Geldig tot",
      className: "text-zinc-500 text-xs",
      render: (q) => formatDate(q.valid_until_date, "nl"),
    },
    {
      key: "total",
      label: "Bedrag",
      className: "text-right font-mono text-zinc-200",
      render: (q) => formatEUR(q.total_cents),
    },
    {
      key: "status",
      label: "Status",
      className: "text-center",
      hideOnMobile: true,
      render: (q) => <StatusBadge status={q.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={currentStatus}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Alle statussen</option>
          <option value="draft">Concept</option>
          <option value="open">Open (verzonden)</option>
          <option value="accepted">Geaccepteerd</option>
          <option value="rejected">Afgewezen</option>
          <option value="expired">Verlopen</option>
          <option value="converted">Omgezet</option>
        </select>
        <select
          value={currentCompanyId}
          onChange={(e) => updateFilter("company_id", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
        rows={quotes}
        columns={columns}
        rowKey={(q) => q.id}
        onRowClick={(q) => router.push(`/quotes/${q.id}`)}
        emptyMessage="Geen offertes."
      />
    </div>
  );
}
