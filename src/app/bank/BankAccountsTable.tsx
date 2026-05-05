"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { BankAccount } from "@/lib/bank/accounts";
import type { Company } from "@/lib/companies";
import type { Account } from "@/lib/ledger/accounts";
import BankAccountForm from "./BankAccountForm";
import SyncButton from "./SyncButton";

interface AccountStats {
  unmatched: number;
  matched: number;
  total: number;
}

const PROVIDER_LABEL: Record<string, string> = {
  camt_upload: "CAMT/CSV upload",
  paypal: "PayPal API",
  gocardless: "GoCardless (PSD2)",
  manual: "Handmatig",
};

export default function BankAccountsTable({
  accounts,
  companies,
  ledgerAccounts,
  paypalReady,
  stats,
}: {
  accounts: BankAccount[];
  companies: Company[];
  ledgerAccounts: Account[];
  paypalReady: boolean;
  stats: Record<string, AccountStats>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (accounts.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-zinc-500">
        Nog geen rekeningen gekoppeld. Voeg er eentje toe hieronder.
      </p>
    );
  }

  const editing = editingId
    ? accounts.find((a) => a.id === editingId) || null
    : null;

  return (
    <>
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
        <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/20">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Naam</th>
            <th className="text-left px-4 py-2 font-medium">Provider</th>
            <th className="text-left px-4 py-2 font-medium">Rekening</th>
            <th className="text-left px-4 py-2 font-medium">IBAN</th>
            <th className="text-right px-4 py-2 font-medium w-32">
              Transacties
            </th>
            <th className="text-right px-4 py-2 font-medium w-32">
              Laatste sync
            </th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-t border-[var(--border)]">
              <td className="px-4 py-2 text-zinc-200">
                <Link
                  href={`/bank/transactions?account=${a.id}`}
                  className="hover:text-emerald-300"
                >
                  {a.display_name}
                </Link>
              </td>
              <td className="px-4 py-2 text-zinc-400 text-xs">
                {PROVIDER_LABEL[a.provider] || a.provider}
              </td>
              <td className="px-4 py-2 font-mono text-zinc-400 text-xs">
                {a.account_code}
              </td>
              <td className="px-4 py-2 font-mono text-zinc-500 text-xs">
                {a.iban || "—"}
              </td>
              <td className="px-4 py-2 text-right text-xs">
                {(() => {
                  const s = stats[a.id] || {
                    unmatched: 0,
                    matched: 0,
                    total: 0,
                  };
                  if (s.total === 0)
                    return <span className="text-zinc-600">geen</span>;
                  return (
                    <Link
                      href={`/bank/transactions?account=${a.id}&status=unmatched`}
                      className="hover:text-emerald-300 text-zinc-300"
                    >
                      {s.total}
                      {s.unmatched > 0 && (
                        <span className="text-amber-300 ml-1">
                          ({s.unmatched} open)
                        </span>
                      )}
                    </Link>
                  );
                })()}
              </td>
              <td className="px-4 py-2 text-right text-zinc-500 text-xs">
                <div className="flex items-center justify-end gap-2">
                  {a.provider === "paypal" && paypalReady && (
                    <SyncButton bankAccountId={a.id} />
                  )}
                  <span>
                    {a.last_sync_at
                      ? new Date(a.last_sync_at).toLocaleDateString("nl-NL")
                      : "nooit"}
                  </span>
                </div>
                {a.last_sync_error && (
                  <p className="text-[10px] text-red-300 mt-1">
                    {a.last_sync_error}
                  </p>
                )}
              </td>
              <td className="px-2 py-2 text-right">
                <button
                  onClick={() => setEditingId(a.id)}
                  className="p-1.5 text-zinc-500 hover:text-emerald-300"
                  title="Bewerk"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setEditingId(null)}
        >
          <div
            className="max-w-2xl w-full mx-2 sm:mx-0"
            onClick={(e) => e.stopPropagation()}
          >
            <BankAccountForm
              companies={companies}
              ledgerAccounts={ledgerAccounts}
              initial={editing}
              onClose={() => setEditingId(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
