import {
  getBankAccount,
  recordSync,
  type BankAccount,
} from "./accounts";
import { upsertTransaction } from "./transactions";
import { fetchPaypalTransactions, paypalConfigured } from "./providers/paypal";
import { autoMatchPending } from "./match";
import { log } from "@/lib/logger";

export interface SyncResult {
  ok: boolean;
  inserted: number;
  skipped: number;
  auto_matched: number;
  error?: string;
}

/**
 * Sync orchestrator: dispatcht op provider, runt fetch + upsert + auto-
 * match. CAMT.053 heeft geen "sync" want het is een upload-flow; PayPal
 * en GoCardless wel. manual heeft ook geen sync.
 */
export async function syncBankAccount(
  accountId: string,
  options?: { lookbackDays?: number },
): Promise<SyncResult> {
  const account = getBankAccount(accountId);
  if (!account) {
    return { ok: false, inserted: 0, skipped: 0, auto_matched: 0, error: "Account niet gevonden" };
  }

  if (account.provider === "paypal") {
    return syncPaypal(account, options);
  }
  if (account.provider === "camt_upload" || account.provider === "manual") {
    return {
      ok: false,
      inserted: 0,
      skipped: 0,
      auto_matched: 0,
      error: `Provider ${account.provider} heeft geen automatische sync — upload via UI`,
    };
  }
  return {
    ok: false,
    inserted: 0,
    skipped: 0,
    auto_matched: 0,
    error: `Provider ${account.provider} nog niet geïmplementeerd`,
  };
}

async function syncPaypal(
  account: BankAccount,
  options?: { lookbackDays?: number },
): Promise<SyncResult> {
  if (!paypalConfigured()) {
    const error =
      "PAYPAL_CLIENT_ID en PAYPAL_CLIENT_SECRET niet ingesteld in .env";
    recordSync(account.id, { ok: false, error });
    return { ok: false, inserted: 0, skipped: 0, auto_matched: 0, error };
  }

  // Bepaal sync-window: vanaf last_sync_at min 1 dag overlap (om
  // settling-vertraging op te vangen), of lookback als nooit gesynced.
  const lookbackDays = options?.lookbackDays || 31;
  const now = new Date();
  // PayPal heeft ~3u settling-vertraging. We pakken altijd minstens 4u
  // achter "now" om geen recent-pending op te halen.
  const safeTo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  let from: Date;
  if (account.last_sync_at) {
    // 1 dag overlap voor settled-na-fact transacties
    const overlap = 24 * 60 * 60 * 1000;
    from = new Date(account.last_sync_at - overlap);
    // Beperk tot lookback om niet eindeloos terug te halen
    const minFrom = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    if (from < minFrom) from = minFrom;
  } else {
    from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  }

  try {
    const txs = await fetchPaypalTransactions({ from, to: safeTo });
    let inserted = 0;
    let skipped = 0;
    for (const tx of txs) {
      const r = upsertTransaction({
        bank_account_id: account.id,
        external_id: tx.external_id,
        date: tx.date,
        amount_cents: tx.amount_cents,
        currency: tx.currency,
        counterparty_name: tx.counterparty_name,
        counterparty_iban: null, // PayPal heeft geen IBAN op tx-niveau
        description: tx.description,
        raw: tx,
      });
      if (r.inserted) inserted++;
      else skipped++;
    }
    recordSync(account.id, { ok: true });

    const auto = autoMatchPending(account.id);

    log.info(
      {
        scope: "bank/sync/paypal",
        account_id: account.id,
        inserted,
        skipped,
        auto_matched: auto.matched,
        from: from.toISOString(),
        to: safeTo.toISOString(),
      },
      "PayPal sync voltooid",
    );

    return {
      ok: true,
      inserted,
      skipped,
      auto_matched: auto.matched,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    recordSync(account.id, { ok: false, error });
    log.error(
      { scope: "bank/sync/paypal", account_id: account.id, err: error },
      "PayPal sync faalde",
    );
    return { ok: false, inserted: 0, skipped: 0, auto_matched: 0, error };
  }
}
