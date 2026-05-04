"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Company } from "@/lib/companies";

export default function PnLCompanyPicker({
  companies,
  currentCompanyId,
}: {
  companies: Company[];
  currentCompanyId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function go(companyId: string) {
    const sp = new URLSearchParams(params.toString());
    if (companyId) sp.set("company", companyId);
    else sp.delete("company");
    router.push(`/reports/pnl?${sp.toString()}`);
  }

  return (
    <select
      value={currentCompanyId}
      onChange={(e) => go(e.target.value)}
      className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
    >
      <option value="">Alle bedrijven</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
