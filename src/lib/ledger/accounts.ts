import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export interface Account {
  code: string;
  tenant_id: string;
  name: string;
  type: AccountType;
  default_vat_rate: number | null;
  active: number;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export type AccountUpdate = Partial<
  Omit<Account, "code" | "tenant_id" | "created_at" | "updated_at">
>;

const UPDATABLE: (keyof AccountUpdate)[] = [
  "name",
  "type",
  "default_vat_rate",
  "active",
  "description",
];

/** NL-default rekeningschema voor SMB. */
const DEFAULT_CHART: Array<
  [
    string,
    string,
    AccountType,
    number | null,
    string | null,
  ]
> = [
  // 0xxx — Vaste activa (geactiveerde investeringen + cumulatieve afschrijvingen)
  ["0500", "Inventaris", "asset", null, "Geactiveerde aanschaf van laptops, meubilair, kantoorinrichting"],
  ["0501", "Cumulatieve afschrijving inventaris", "asset", null, "Contra-rekening van 0500 — opbouw van afschrijvingen"],
  ["0510", "Machines & installaties", "asset", null, null],
  ["0511", "Cum. afschr. machines & installaties", "asset", null, null],
  ["0520", "Voertuigen", "asset", null, null],
  ["0521", "Cum. afschr. voertuigen", "asset", null, null],

  // 1xxx — Activa
  ["1100", "Bank Rabobank", "asset", null, "Lopende rekening Rabobank"],
  ["1110", "PayPal", "asset", null, null],
  ["1120", "Revolut", "asset", null, null],
  ["1130", "Creditcard", "asset", null, null],
  ["1300", "Debiteuren", "asset", null, "Te ontvangen van klanten"],
  ["1500", "BTW vorderingen", "asset", null, "Voorbelasting (te ontvangen BTW)"],

  // 1600/1700/1900 — Schulden
  ["1600", "Crediteuren", "liability", null, "Te betalen aan leveranciers"],
  ["1700", "BTW te betalen", "liability", null, "Verschuldigde BTW"],
  ["1900", "Rekening-courant directie", "liability", null, "Privé-onttrekkingen / DGA"],

  // 4xxx — Bedrijfskosten
  ["4000", "Algemene kosten", "expense", 21, null],
  ["4100", "Huur", "expense", 21, null],
  ["4200", "Verzekeringen", "expense", 0, null],
  ["4300", "Energie & nuts", "expense", 21, null],
  ["4350", "Afschrijvingskosten", "expense", 0, "Maandelijkse afschrijving van geactiveerde investeringen"],
  ["4400", "Telefoon & internet", "expense", 21, null],
  ["4500", "Reiskosten", "expense", 9, null],
  ["4550", "Auto / brandstof", "expense", 21, null],
  ["4600", "ICT-software & SaaS", "expense", 21, null],
  ["4700", "Marketing & reclame", "expense", 21, null],
  ["4800", "Bankkosten", "expense", 0, null],
  ["4900", "Accountantskosten", "expense", 21, null],
  ["4950", "Diverse kleine kosten", "expense", 21, null],

  // 7000 — Inkoopwaarde
  ["7000", "Inkoopwaarde omzet", "expense", 21, null],

  // 8xxx — Omzet
  ["8000", "Omzet 21% binnenland", "income", 21, null],
  ["8001", "Omzet 9% binnenland", "income", 9, null],
  ["8002", "Omzet 0% / vrijgesteld", "income", 0, null],
  ["8003", "Omzet intracommunautair (verlegd)", "income", 0, "EU B2B reverse charge"],
  ["8004", "Omzet export buiten EU", "income", 0, null],

  // 9000 — Buitengewoon
  ["9000", "Buitengewone baten/lasten", "income", 0, null],
];

export function ensureDefaultChartSeeded(): void {
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const now = Date.now();
  // INSERT OR IGNORE zodat we ontbrekende rekeningen kunnen toevoegen
  // op een al-geseede tenant (bv. nieuwe 0xxx vaste activa-rekeningen
  // toevoegen aan een bestaande Intersumma-admin).
  const insert = db.prepare(
    `INSERT OR IGNORE INTO chart_of_accounts
       (code, tenant_id, name, type, default_vat_rate, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const [code, name, type, vat, desc] of DEFAULT_CHART) {
      insert.run(code, tenantId, name, type, vat, desc, now, now);
    }
  });
  tx();
}

export function listAccounts(opts?: {
  type?: AccountType;
  activeOnly?: boolean;
}): Account[] {
  const db = getDb();
  const where: string[] = ["tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (opts?.type) {
    where.push("type = ?");
    values.push(opts.type);
  }
  if (opts?.activeOnly) {
    where.push("active = 1");
  }
  return db
    .prepare(
      `SELECT * FROM chart_of_accounts
       WHERE ${where.join(" AND ")}
       ORDER BY code`,
    )
    .all(...values) as Account[];
}

export function getAccount(code: string): Account | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM chart_of_accounts WHERE code = ? AND tenant_id = ?",
    )
    .get(code, getCurrentTenantId()) as Account | undefined;
  return row ?? null;
}

export function createAccount(
  input: { code: string; name: string; type: AccountType } & AccountUpdate,
): Account {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO chart_of_accounts
       (code, tenant_id, name, type, default_vat_rate, active, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.code,
    getCurrentTenantId(),
    input.name,
    input.type,
    input.default_vat_rate ?? null,
    input.active ?? 1,
    input.description ?? null,
    now,
    now,
  );
  return getAccount(input.code)!;
}

export function updateAccount(
  code: string,
  patch: AccountUpdate,
): Account | null {
  const db = getDb();
  const fields = UPDATABLE.filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return getAccount(code);
  const setSql = fields.map((k) => `${k} = ?`).join(", ");
  const values = fields.map((k) => patch[k] as unknown);
  db.prepare(
    `UPDATE chart_of_accounts SET ${setSql}, updated_at = ?
     WHERE code = ? AND tenant_id = ?`,
  ).run(...values, Date.now(), code, getCurrentTenantId());
  return getAccount(code);
}

/**
 * Verwijder een rekening — alleen toegestaan als 'ie nooit is gebruikt
 * in een journaalpost. Gebruik active=0 om 'm te "verbergen" zonder
 * historische data aan te tasten.
 */
export function deleteAccount(code: string): {
  ok: boolean;
  reason?: string;
} {
  const db = getDb();
  const used = db
    .prepare(
      `SELECT COUNT(*) AS n FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.tenant_id = ? AND jl.account_code = ?`,
    )
    .get(getCurrentTenantId(), code) as { n: number };
  if (used.n > 0) {
    return {
      ok: false,
      reason: `Rekening is gebruikt in ${used.n} boekingsregel${used.n === 1 ? "" : "s"}. Zet 'm op inactief in plaats van te verwijderen.`,
    };
  }
  // Cascade: NULL het veld op suppliers + purchase_invoice_lines die ernaar
  // wijzen, voordat we de rekening verwijderen.
  db.prepare(
    "UPDATE suppliers SET default_account_code = NULL WHERE tenant_id = ? AND default_account_code = ?",
  ).run(getCurrentTenantId(), code);
  db.prepare(
    "UPDATE purchase_invoice_lines SET account_code = NULL WHERE account_code = ?",
  ).run(code);
  const res = db
    .prepare(
      "DELETE FROM chart_of_accounts WHERE code = ? AND tenant_id = ?",
    )
    .run(code, getCurrentTenantId());
  return { ok: res.changes > 0 };
}

/** Saldo (debet - credit, in cents) van een rekening tot en met `untilDate`. */
export function getAccountBalance(
  code: string,
  untilDate?: string,
): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(jl.debit_cents), 0) AS debit,
         COALESCE(SUM(jl.credit_cents), 0) AS credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_code = ?
         AND je.tenant_id = ?
         AND (? IS NULL OR je.date <= ?)`,
    )
    .get(code, getCurrentTenantId(), untilDate ?? null, untilDate ?? null) as {
    debit: number;
    credit: number;
  };
  return row.debit - row.credit;
}
