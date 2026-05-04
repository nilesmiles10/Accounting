import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export type BankProvider = "camt_upload" | "paypal" | "gocardless" | "manual";

export interface BankAccount {
  id: string;
  tenant_id: string;
  company_id: string | null;
  account_code: string;
  provider: BankProvider;
  display_name: string;
  iban: string | null;
  currency: string;
  external_account_id: string | null;
  credentials_json: string | null;
  last_sync_at: number | null;
  last_sync_error: string | null;
  active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateBankAccountInput {
  account_code: string;
  provider: BankProvider;
  display_name: string;
  iban?: string | null;
  company_id?: string | null;
  external_account_id?: string | null;
  credentials_json?: string | null;
}

export function listBankAccounts(filter?: {
  activeOnly?: boolean;
}): BankAccount[] {
  const db = getDb();
  const where: string[] = ["tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (filter?.activeOnly) {
    where.push("active = 1");
  }
  return db
    .prepare(
      `SELECT * FROM bank_accounts
       WHERE ${where.join(" AND ")}
       ORDER BY display_name`,
    )
    .all(...values) as BankAccount[];
}

export function getBankAccount(id: string): BankAccount | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT * FROM bank_accounts WHERE id = ? AND tenant_id = ?",
      )
      .get(id, getCurrentTenantId()) as BankAccount | undefined) || null
  );
}

export function findBankAccountByIban(iban: string): BankAccount | null {
  const db = getDb();
  const normalized = iban.replace(/\s/g, "").toUpperCase();
  return (
    (db
      .prepare(
        "SELECT * FROM bank_accounts WHERE tenant_id = ? AND REPLACE(UPPER(iban), ' ', '') = ?",
      )
      .get(getCurrentTenantId(), normalized) as BankAccount | undefined) ||
    null
  );
}

export function createBankAccount(input: CreateBankAccountInput): BankAccount {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO bank_accounts (
       id, tenant_id, company_id, account_code, provider, display_name,
       iban, currency, external_account_id, credentials_json,
       active, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, 1, ?, ?)`,
  ).run(
    id,
    getCurrentTenantId(),
    input.company_id ?? null,
    input.account_code,
    input.provider,
    input.display_name,
    input.iban ? input.iban.replace(/\s/g, "").toUpperCase() : null,
    input.external_account_id ?? null,
    input.credentials_json ?? null,
    now,
    now,
  );
  return getBankAccount(id)!;
}

export function updateBankAccount(
  id: string,
  patch: Partial<{
    display_name: string;
    iban: string | null;
    company_id: string | null;
    credentials_json: string | null;
    active: number;
  }>,
): BankAccount | null {
  const current = getBankAccount(id);
  if (!current) return null;
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    if (k === "iban" && typeof v === "string") {
      values.push(v.replace(/\s/g, "").toUpperCase());
    } else {
      values.push(v ?? null);
    }
  }
  if (fields.length === 0) return current;
  fields.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);
  db.prepare(`UPDATE bank_accounts SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getBankAccount(id);
}

/**
 * Verwijder een bank-account. Faalt als er nog transacties op zitten —
 * dan is alleen archiveren (active=0) toegestaan, om audit-trail
 * intact te houden.
 */
export function deleteBankAccount(id: string): {
  ok: boolean;
  reason?: string;
} {
  const db = getDb();
  const tx = db
    .prepare(
      `SELECT COUNT(*) AS n FROM bank_transactions WHERE bank_account_id = ?`,
    )
    .get(id) as { n: number };
  if (tx.n > 0) {
    return {
      ok: false,
      reason: `Rekening heeft ${tx.n} transacties — kan niet verwijderd worden, archiveer 'm in plaats daarvan`,
    };
  }
  const result = db
    .prepare(
      `DELETE FROM bank_accounts WHERE id = ? AND tenant_id = ?`,
    )
    .run(id, getCurrentTenantId());
  if (result.changes === 0) {
    return { ok: false, reason: "Niet gevonden" };
  }
  return { ok: true };
}

export function recordSync(
  id: string,
  result: { ok: boolean; error?: string },
): void {
  const db = getDb();
  db.prepare(
    `UPDATE bank_accounts SET last_sync_at = ?, last_sync_error = ?, updated_at = ? WHERE id = ?`,
  ).run(Date.now(), result.ok ? null : result.error || null, Date.now(), id);
}
