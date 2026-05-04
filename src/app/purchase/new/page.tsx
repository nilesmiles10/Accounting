import { redirect } from "next/navigation";
import { listCompanies } from "@/lib/companies";
import { createPurchaseInvoice } from "@/lib/purchase-invoices";
import { getCurrentTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * "Handmatig invoeren" knop creëert direct een lege concept-factuur
 * voor het eerste bedrijf en redirect naar de editor. Daar kun je
 * leverancier kiezen, regels invoeren etc.
 */
export default function NewPurchasePage() {
  const _tenant = getCurrentTenant(); // ensure tenant exists
  void _tenant;
  const companies = listCompanies();
  if (companies.length === 0) {
    redirect("/settings/companies");
  }
  const draft = createPurchaseInvoice({
    company_id: companies[0]!.id,
    source: "manual",
  });
  redirect(`/purchase/${draft.id}`);
}
