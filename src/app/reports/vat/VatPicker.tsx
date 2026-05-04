"use client";

import { useRouter } from "next/navigation";

export default function VatPicker({
  currentYear,
  currentQuarter,
}: {
  currentYear: number;
  currentQuarter: number;
}) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="flex flex-wrap gap-2 items-center text-sm">
      <span className="text-zinc-500">Kwartaal:</span>
      {[1, 2, 3, 4].map((q) => (
        <button
          key={q}
          onClick={() =>
            router.push(`/reports/vat?year=${currentYear}&q=${q}`)
          }
          className={`px-3 py-1.5 rounded-md border ${
            q === currentQuarter
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
              : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          Q{q}
        </button>
      ))}
      <span className="text-zinc-500 ml-2">Jaar:</span>
      <select
        value={currentYear}
        onChange={(e) =>
          router.push(
            `/reports/vat?year=${e.target.value}&q=${currentQuarter}`,
          )
        }
        className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
