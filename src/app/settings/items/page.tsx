import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listCompanies } from "@/lib/companies";
import { listItems } from "@/lib/items";
import ItemsManager from "./ItemsManager";

export const dynamic = "force-dynamic";

export default function ItemsPage({
  searchParams,
}: {
  searchParams: { company_id?: string };
}) {
  const companies = listCompanies();
  const activeCompanyId =
    (searchParams.company_id &&
      companies.find((c) => c.id === searchParams.company_id)?.id) ||
    companies[0]?.id ||
    "";
  const items = activeCompanyId ? listItems(activeCompanyId) : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <Link
          href="/settings"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Instellingen
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Catalog</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Herbruikbare regels voor offertes en facturen. Per bedrijf eigen
          lijst.
        </p>
      </header>

      <ItemsManager
        companies={companies}
        activeCompanyId={activeCompanyId}
        initialItems={items}
      />
    </div>
  );
}
