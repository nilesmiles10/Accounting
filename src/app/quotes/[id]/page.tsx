import { notFound } from "next/navigation";
import { getQuoteWithLines } from "@/lib/quotes";
import { listCompanies } from "@/lib/companies";
import { listClients, getClient } from "@/lib/clients";
import QuoteEditor from "../QuoteEditor";
import QuoteDetail from "./QuoteDetail";

export const dynamic = "force-dynamic";

export default function QuotePage({ params }: { params: { id: string } }) {
  const quote = getQuoteWithLines(params.id);
  if (!quote) notFound();

  if (quote.status === "draft") {
    const companies = listCompanies();
    const clients = listClients();
    return (
      <div className="max-w-6xl mx-auto">
        <QuoteEditor companies={companies} clients={clients} quote={quote} />
      </div>
    );
  }

  const client = getClient(quote.client_id);
  return (
    <div className="max-w-4xl mx-auto">
      <QuoteDetail quote={quote} clientEmail={client?.email || null} />
    </div>
  );
}
