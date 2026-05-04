"use client";

import { useRouter } from "next/navigation";

export default function BalanceDatePicker({
  currentAsOf,
}: {
  currentAsOf: string;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500">Peildatum:</span>
      <input
        type="date"
        value={currentAsOf}
        onChange={(e) =>
          router.push(`/reports/balance?as_of=${e.target.value}`)
        }
        className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
      />
    </div>
  );
}
