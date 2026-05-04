import { notFound } from "next/navigation";
import { getPurchaseInvoiceWithLines } from "@/lib/purchase-invoices";
import { listCompanies } from "@/lib/companies";
import { listSuppliers } from "@/lib/suppliers";
import { listAccounts } from "@/lib/ledger/accounts";
import PurchaseEditor from "./PurchaseEditor";

export const dynamic = "force-dynamic";

export default function PurchaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = getPurchaseInvoiceWithLines(params.id);
  if (!invoice) notFound();
  const companies = listCompanies();
  const suppliers = listSuppliers();
  // Voor het boekingsoverzicht hebben we de namen van de grootboekrekeningen
  // nodig (4600 → "ICT-software"). Stuur de hele actieve lijst mee.
  const accounts = listAccounts({ activeOnly: true });

  return (
    <div className="max-w-7xl mx-auto">
      <PurchaseEditor
        invoice={invoice}
        companies={companies}
        suppliers={suppliers}
        accounts={accounts}
      />
    </div>
  );
}
