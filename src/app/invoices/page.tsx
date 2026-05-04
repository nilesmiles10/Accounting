import Link from "next/link";
import { Plus, Download } from "lucide-react";
import {
  listInvoices,
  markOverdueInvoices,
  type InvoiceStatus,
} from "@/lib/invoices";
import { listCompanies } from "@/lib/companies";
import { getDb } from "@/lib/db";
import InvoicesList from "./InvoicesList";

export const dynamic = "force-dynamic";

interface YearRow {
  y: string;
}

export default function InvoicesPage({
  searchParams,
}: {
  searchParams: { status?: string; company_id?: string; year?: string };
}) {
  markOverdueInvoices();
  const status = normalizeStatus(searchParams.status);
  const company_id = searchParams.company_id;
  const yearFilter =
    searchParams.year && /^\d{4}$/.test(searchParams.year)
      ? searchParams.year
      : undefined;
  let invoices = listInvoices({ status, company_id });
  if (yearFilter) {
    invoices = invoices.filter((i) => i.issue_date.startsWith(`${yearFilter}-`));
  }
  const companies = listCompanies();

  const years = (
    getDb()
      .prepare(
        "SELECT DISTINCT substr(issue_date,1,4) AS y FROM invoices ORDER BY y DESC",
      )
      .all() as YearRow[]
  ).map((r) => r.y);

  const exportQs = new URLSearchParams();
  if (yearFilter) exportQs.set("year", yearFilter);
  if (company_id) exportQs.set("company_id", company_id);
  if (searchParams.status) exportQs.set("status", searchParams.status);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← Overzicht
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">Facturen</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Maak, bewerk en verstuur facturen. Concepten zijn vrij bewerkbaar;
            na finaliseren krijgt de factuur een definitief nummer uit de
            sequentie van het bedrijf.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/api/invoices/export?${exportQs.toString()}`}
            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition-colors"
            title="CSV download voor boekhouder"
          >
            <Download className="w-4 h-4" />
            CSV
          </Link>
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nieuwe factuur
          </Link>
        </div>
      </header>

      <InvoicesList
        invoices={invoices}
        companies={companies}
        years={years}
        currentStatus={searchParams.status || ""}
        currentCompanyId={company_id || ""}
        currentYear={yearFilter || ""}
      />
    </div>
  );
}

function normalizeStatus(
  raw?: string,
): InvoiceStatus | "open" | undefined {
  const valid = ["draft", "sent", "paid", "overdue", "cancelled", "open"];
  if (!raw || !valid.includes(raw)) return undefined;
  return raw as InvoiceStatus | "open";
}
