import { listCompanies } from "@/lib/companies";
import { listClients } from "@/lib/clients";
import InvoiceEditor from "../InvoiceEditor";

export const dynamic = "force-dynamic";

export default function NewInvoicePage() {
  const companies = listCompanies();
  const clients = listClients();
  return (
    <div className="max-w-6xl mx-auto">
      <InvoiceEditor companies={companies} clients={clients} />
    </div>
  );
}
