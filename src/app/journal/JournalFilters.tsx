"use client";

import { useRouter } from "next/navigation";
import type { Account } from "@/lib/ledger/accounts";

export default function JournalFilters({
  accounts,
  currentFrom,
  currentTo,
  currentAccountCode,
  currentSourceType,
}: {
  accounts: Account[];
  currentFrom: string;
  currentTo: string;
  currentAccountCode: string;
  currentSourceType: string;
}) {
  const router = useRouter();

  function update(key: string, value: string) {
    const params = new URLSearchParams();
    if (currentFrom && key !== "from") params.set("from", currentFrom);
    if (currentTo && key !== "to") params.set("to", currentTo);
    if (currentAccountCode && key !== "account_code")
      params.set("account_code", currentAccountCode);
    if (currentSourceType && key !== "source_type")
      params.set("source_type", currentSourceType);
    if (value) params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `/journal?${qs}` : "/journal");
  }

  return (
    <div className="flex flex-wrap gap-3 items-end text-sm">
      <label>
        <span className="block text-xs text-zinc-500 mb-1">Vanaf</span>
        <input
          type="date"
          value={currentFrom}
          onChange={(e) => update("from", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        />
      </label>
      <label>
        <span className="block text-xs text-zinc-500 mb-1">Tot</span>
        <input
          type="date"
          value={currentTo}
          onChange={(e) => update("to", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        />
      </label>
      <label>
        <span className="block text-xs text-zinc-500 mb-1">Rekening</span>
        <select
          value={currentAccountCode}
          onChange={(e) => update("account_code", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        >
          <option value="">Alle</option>
          {accounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="block text-xs text-zinc-500 mb-1">Bron</span>
        <select
          value={currentSourceType}
          onChange={(e) => update("source_type", e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200"
        >
          <option value="">Alle</option>
          <option value="invoice">Verkoopfacturen</option>
          <option value="purchase">Inkoopfacturen</option>
          <option value="bank_match">Bankboekingen</option>
          <option value="manual">Handmatig</option>
          <option value="opening">Beginsaldo</option>
        </select>
      </label>
    </div>
  );
}
