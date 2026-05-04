import { notFound } from "next/navigation";
import { getInvoiceWithLines } from "@/lib/invoices";
import { listCompanies } from "@/lib/companies";
import { listClients } from "@/lib/clients";
import { getClient } from "@/lib/clients";
import InvoiceEditor from "../InvoiceEditor";
import InvoiceDetail from "./InvoiceDetail";

export const dynamic = "force-dynamic";

export default function InvoicePage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = getInvoiceWithLines(params.id);
  if (!invoice) notFound();

  if (invoice.status === "draft") {
    const companies = listCompanies();
    const clients = listClients();
    return (
      <div className="max-w-6xl mx-auto">
        <InvoiceEditor
          companies={companies}
          clients={clients}
          invoice={invoice}
        />
      </div>
    );
  }

  const client = getClient(invoice.client_id);
  return (
    <div className="max-w-4xl mx-auto">
      <InvoiceDetail invoice={invoice} clientEmail={client?.email || null} />
    </div>
  );
}
