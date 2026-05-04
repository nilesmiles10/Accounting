import Link from "next/link";
import { Plus } from "lucide-react";
import {
  listPurchaseInvoices,
  type PurchaseStatus,
} from "@/lib/purchase-invoices";
import { listCompanies } from "@/lib/companies";
import { listSuppliers } from "@/lib/suppliers";
import PurchaseList from "./PurchaseList";
import UploadButton from "./UploadButton";

export const dynamic = "force-dynamic";

const VALID: PurchaseStatus[] = [
  "draft",
  "review",
  "approved",
  "paid",
  "cancelled",
];

export default function PurchasePage({
  searchParams,
}: {
  searchParams: { status?: string; company_id?: string; supplier_id?: string };
}) {
  const status =
    searchParams.status && VALID.includes(searchParams.status as PurchaseStatus)
      ? (searchParams.status as PurchaseStatus)
      : undefined;
  const invoices = listPurchaseInvoices({
    status,
    company_id: searchParams.company_id,
    supplier_id: searchParams.supplier_id,
  });
  const companies = listCompanies();
  const suppliers = listSuppliers();

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
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">Inkoop</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Inkomende facturen van leveranciers. Upload PDF of laat ze
            automatisch via email-OCR binnenkomen (volgt).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UploadButton companies={companies} />
          <Link
            href="/purchase/new"
            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Handmatig invoeren
          </Link>
        </div>
      </header>

      <PurchaseList
        invoices={invoices}
        companies={companies}
        suppliers={suppliers}
        currentStatus={searchParams.status || ""}
        currentCompanyId={searchParams.company_id || ""}
        currentSupplierId={searchParams.supplier_id || ""}
      />
    </div>
  );
}
