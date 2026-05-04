import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export type BankTxStatus = "unmatched" | "matched" | "ignored";

export interface BankTransaction {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  external_id: string;
  date: string;
  booking_date: string | null;
  amount_cents: number;
  currency: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  description: string | null;
  raw_json: string | null;
  status: BankTxStatus;
  ignored_reason: string | null;
  created_at: number;
  updated_at: number;
}

export interface BankTransactionInput {
  bank_account_id: string;
  external_id: string;          // dedup key per account
  date: string;
  booking_date?: string | null;
  amount_cents: number;
  currency?: string;
  counterparty_name?: string | null;
  counterparty_iban?: string | null;
  description?: string | null;
  raw?: unknown;
}

/**
 * Importeer/upsert een transactie. Dedup per (bank_account_id, external_id).
 * Geeft true terug als nieuw, false als al bestond (skip).
 */
export function upsertTransaction(input: BankTransactionInput): {
  inserted: boolean;
  id: string;
} {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM bank_transactions
       WHERE bank_account_id = ? AND external_id = ?`,
    )
    .get(input.bank_account_id, input.external_id) as
    | { id: string }
    | undefined;
  if (existing) {
    return { inserted: false, id: existing.id };
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO bank_transactions (
       id, tenant_id, bank_account_id, external_id, date, booking_date,
       amount_cents, currency, counterparty_name, counterparty_iban,
       description, raw_json, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched', ?, ?)`,
  ).run(
    id,
    getCurrentTenantId(),
    input.bank_account_id,
    input.external_id,
    input.date,
    input.booking_date ?? null,
    input.amount_cents,
    input.currency || "EUR",
    input.counterparty_name ?? null,
    input.counterparty_iban ?? null,
    input.description ?? null,
    input.raw ? JSON.stringify(input.raw) : null,
    now,
    now,
  );
  return { inserted: true, id };
}

export function listTransactions(filter?: {
  bank_account_id?: string;
  status?: BankTxStatus;
  from?: string;
  to?: string;
  limit?: number;
}): BankTransaction[] {
  const db = getDb();
  const where: string[] = ["tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (filter?.bank_account_id) {
    where.push("bank_account_id = ?");
    values.push(filter.bank_account_id);
  }
  if (filter?.status) {
    where.push("status = ?");
    values.push(filter.status);
  }
  if (filter?.from) {
    where.push("date >= ?");
    values.push(filter.from);
  }
  if (filter?.to) {
    where.push("date <= ?");
    values.push(filter.to);
  }
  const limit = filter?.limit || 500;
  return db
    .prepare(
      `SELECT * FROM bank_transactions
       WHERE ${where.join(" AND ")}
       ORDER BY date DESC, created_at DESC
       LIMIT ?`,
    )
    .all(...values, limit) as BankTransaction[];
}

export function getTransaction(id: string): BankTransaction | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT * FROM bank_transactions WHERE id = ? AND tenant_id = ?",
      )
      .get(id, getCurrentTenantId()) as BankTransaction | undefined) || null
  );
}

export function setTransactionStatus(
  id: string,
  status: BankTxStatus,
  ignoredReason?: string | null,
): void {
  const db = getDb();
  db.prepare(
    `UPDATE bank_transactions
     SET status = ?, ignored_reason = ?, updated_at = ?
     WHERE id = ?`,
  ).run(status, ignoredReason ?? null, Date.now(), id);
}

/**
 * Statistieken voor sync-banner: hoeveel unmatched, hoeveel ignored.
 */
export function getStats(bankAccountId?: string): {
  unmatched: number;
  matched: number;
  ignored: number;
  total: number;
} {
  const db = getDb();
  const where: string[] = ["tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (bankAccountId) {
    where.push("bank_account_id = ?");
    values.push(bankAccountId);
  }
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched,
         SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) AS matched,
         SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) AS ignored,
         COUNT(*) AS total
       FROM bank_transactions
       WHERE ${where.join(" AND ")}`,
    )
    .get(...values) as {
    unmatched: number | null;
    matched: number | null;
    ignored: number | null;
    total: number;
  };
  return {
    unmatched: row.unmatched || 0,
    matched: row.matched || 0,
    ignored: row.ignored || 0,
    total: row.total || 0,
  };
}
