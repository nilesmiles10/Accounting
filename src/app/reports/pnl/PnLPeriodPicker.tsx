"use client";

import { useRouter } from "next/navigation";

export default function PnLPeriodPicker({
  currentFrom,
  currentTo,
}: {
  currentFrom: string;
  currentTo: string;
}) {
  const router = useRouter();

  function go(from: string, to: string) {
    router.push(
      `/reports/pnl?from=${from}&to=${to}`,
    );
  }

  function quarter(year: number, q: number) {
    router.push(`/reports/pnl?year=${year}&q=${q}`);
  }

  function fullYear(year: number) {
    router.push(`/reports/pnl?year=${year}`);
  }

  const thisYear = new Date().getFullYear();
  const quarters = [1, 2, 3, 4];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end text-sm">
        <input
          type="date"
          value={currentFrom}
          onChange={(e) => go(e.target.value, currentTo)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        />
        <span className="text-zinc-500">tot</span>
        <input
          type="date"
          value={currentTo}
          onChange={(e) => go(currentFrom, e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {quarters.map((q) => (
          <button
            key={q}
            onClick={() => quarter(thisYear, q)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-zinc-300 hover:bg-zinc-800"
          >
            Q{q} {thisYear}
          </button>
        ))}
        <button
          onClick={() => fullYear(thisYear)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-zinc-300 hover:bg-zinc-800"
        >
          Heel {thisYear}
        </button>
        <button
          onClick={() => fullYear(thisYear - 1)}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-zinc-300 hover:bg-zinc-800"
        >
          Heel {thisYear - 1}
        </button>
      </div>
    </div>
  );
}
