import Link from "next/link";
import { Plus } from "lucide-react";
import { listCompanies } from "@/lib/companies";
import CompanyEditor from "./CompanyEditor";
import NewCompanyInputs from "./NewCompanyInputs";

export const dynamic = "force-dynamic";

export default function CompaniesPage() {
  const companies = listCompanies();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← Overzicht
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">Bedrijven</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Jouw facturerende bedrijven. Intersumma en Kisou staan klaar — vul
            de gegevens aan zodat ze op facturen verschijnen.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {companies.map((c) => (
          <CompanyEditor key={c.id} initial={c} />
        ))}
      </div>

      <NewCompanyForm />
    </div>
  );
}

function NewCompanyForm() {
  return (
    <details className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <summary className="flex items-center gap-2 text-sm font-medium text-zinc-300 cursor-pointer">
        <Plus className="w-4 h-4" />
        Nieuw bedrijf toevoegen
      </summary>
      <NewCompanyInputs />
    </details>
  );
}
