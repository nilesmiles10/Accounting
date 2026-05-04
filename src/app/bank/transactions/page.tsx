import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listBankAccounts } from "@/lib/bank/accounts";
import {
  listTransactions,
  type BankTxStatus,
} from "@/lib/bank/transactions";
import { listAccounts } from "@/lib/ledger/accounts";
import TransactionRow from "./TransactionRow";
import AutoMatchButton from "../AutoMatchButton";

export const dynamic = "force-dynamic";

export default function TransactionsPage({
  searchParams,
}: {
  searchParams: { account?: string; status?: BankTxStatus };
}) {
  const accounts = listBankAccounts({ activeOnly: true });
  // Bookable accounts voor direct boeken — alle behalve 1xxx system
  // accounts (bank/debiteuren/BTW worden door auto-journaal beheerd).
  const allLedger = listAccounts({ activeOnly: true });
  const bookableAccounts = allLedger.filter((a) => {
    if (a.type === "expense") return true;
    if (a.type === "income") return true;
    if (a.type === "asset" && !a.code.startsWith("1")) return true;
    if (a.type === "liability" && !["1600", "1700", "1500"].includes(a.code))
      return true;
    if (a.type === "equity") return true;
    return false;
  });
  const status: BankTxStatus = (searchParams.status as BankTxStatus) || "unmatched";
  const txs = listTransactions({
    bank_account_id: searchParams.account,
    status,
    limit: 200,
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <Link
          href="/bank"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Bank-import
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Transacties</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {status === "unmatched"
            ? "Wachten op match — koppel aan factuur of negeer."
            : status === "matched"
              ? "Gematched aan facturen / inkoop."
              : "Genegeerd (privé, intern, dubbel)."}
        </p>
      </header>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 text-xs">
          {(["unmatched", "matched", "ignored"] as BankTxStatus[]).map((s) => (
            <Link
              key={s}
              href={`/bank/transactions?status=${s}${searchParams.account ? `&account=${searchParams.account}` : ""}`}
              className={`px-3 py-1.5 rounded-full border ${
                status === s
                  ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                  : "border-[var(--border)] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s === "unmatched" ? "Open" : s === "matched" ? "Gematched" : "Genegeerd"}
            </Link>
          ))}
        </div>
        {status === "unmatched" && (
          <AutoMatchButton accountId={searchParams.account} />
        )}
      </div>

      {txs.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          Geen transacties in deze view.
        </p>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden divide-y divide-[var(--border)]">
          {txs.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              accountName={
                accountById.get(tx.bank_account_id)?.display_name || "—"
              }
              status={status}
              bookableAccounts={bookableAccounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}
