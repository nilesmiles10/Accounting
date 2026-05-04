import { listCompanies } from "@/lib/companies";
import { listClients } from "@/lib/clients";
import QuoteEditor from "../QuoteEditor";

export const dynamic = "force-dynamic";

export default function NewQuotePage() {
  const companies = listCompanies();
  const clients = listClients();
  return (
    <div className="max-w-6xl mx-auto">
      <QuoteEditor companies={companies} clients={clients} />
    </div>
  );
}
