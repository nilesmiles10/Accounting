import Link from "next/link";
import { Plus } from "lucide-react";
import {
  listQuotes,
  markExpiredQuotes,
  type QuoteStatus,
} from "@/lib/quotes";
import { listCompanies } from "@/lib/companies";
import { getDb } from "@/lib/db";
import QuotesList from "./QuotesList";

export const dynamic = "force-dynamic";

interface YearRow {
  y: string;
}

export default function QuotesPage({
  searchParams,
}: {
  searchParams: { status?: string; company_id?: string; year?: string };
}) {
  markExpiredQuotes();
  const status = normalizeStatus(searchParams.status);
  const company_id = searchParams.company_id;
  const yearFilter =
    searchParams.year && /^\d{4}$/.test(searchParams.year)
      ? searchParams.year
      : undefined;
  let quotes = listQuotes({ status, company_id });
  if (yearFilter) {
    quotes = quotes.filter((q) => q.issue_date.startsWith(`${yearFilter}-`));
  }
  const companies = listCompanies();
  const years = (
    getDb()
      .prepare(
        "SELECT DISTINCT substr(issue_date,1,4) AS y FROM quotes ORDER BY y DESC",
      )
      .all() as YearRow[]
  ).map((r) => r.y);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← Overzicht
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">Offertes</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Prijsopgaven per klant. Na acceptatie een-klik omzetten naar
            concept-factuur.
          </p>
        </div>
        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe offerte
        </Link>
      </header>

      <QuotesList
        quotes={quotes}
        companies={companies}
        years={years}
        currentStatus={searchParams.status || ""}
        currentCompanyId={company_id || ""}
        currentYear={yearFilter || ""}
      />
    </div>
  );
}

function normalizeStatus(raw?: string): QuoteStatus | "open" | undefined {
  const valid = [
    "draft",
    "sent",
    "accepted",
    "rejected",
    "expired",
    "converted",
    "open",
  ];
  if (!raw || !valid.includes(raw)) return undefined;
  return raw as QuoteStatus | "open";
}
