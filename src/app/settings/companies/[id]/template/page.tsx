import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCompany } from "@/lib/companies";
import TemplateEditor from "./TemplateEditor";

export const dynamic = "force-dynamic";

export default function CompanyTemplatePage({
  params,
}: {
  params: { id: string };
}) {
  const company = getCompany(params.id);
  if (!company) notFound();

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <header>
        <Link
          href="/settings/companies"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Bedrijven
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Template — {company.name}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Pas de styling aan van facturen voor dit bedrijf. De preview
          rechts toont een voorbeeld-factuur met jouw keuzes. Wijzigingen
          gelden alleen voor nieuwe facturen — reeds verstuurde PDF&apos;s
          blijven zoals ze waren op het moment van verzending.
        </p>
      </header>

      <TemplateEditor company={company} />
    </div>
  );
}
