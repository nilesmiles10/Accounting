import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  account_code: string;
  description: string | null;
  debit_cents: number;
  credit_cents: number;
  vat_code: string | null;
  client_id: string | null;
  supplier_id: string | null;
}

export interface JournalEntry {
  id: string;
  tenant_id: string;
  company_id: string | null;
  date: string;
  description: string;
  source_type: string;
  source_id: string | null;
  locked: number;
  notes: string | null;
  created_at: number;
  created_by: string | null;
  reversed_by: string | null;
  reverses_id: string | null;
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalLine[];
}

export interface PostInput {
  date: string;          // ISO yyyy-mm-dd
  description: string;
  source_type:
    | "invoice"
    | "purchase"
    | "bank_match"
    | "manual"
    | "opening"
    | "vat_submission";
  source_id?: string | null;
  /** Welk eigen-bedrijf deze boeking hoort - voor P&L per company.
   * Null voor tenant-wide boekingen (BTW-afdracht, openingsbalans
   * van gedeelde rekening, etc.). */
  company_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  lines: Array<{
    account_code: string;
    description?: string | null;
    debit_cents?: number;
    credit_cents?: number;
    vat_code?: string | null;
    client_id?: string | null;
    supplier_id?: string | null;
  }>;
}

/**
 * Atomic post: maakt journal_entry + lines, valideert balans en
 * period-status. Gooit als de boeking ongebalanceerd is, of als de
 * periode al is afgesloten.
 */
export function post(input: PostInput): JournalEntryWithLines {
  if (input.lines.length < 2) {
    throw new Error("Een boeking heeft minstens 2 regels nodig");
  }

  // Validatie + normalisatie
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of input.lines) {
    const d = l.debit_cents || 0;
    const c = l.credit_cents || 0;
    if (d < 0 || c < 0) {
      throw new Error("Debet en credit moeten ≥ 0 zijn");
    }
    if (d > 0 && c > 0) {
      throw new Error("Eén regel mag niet tegelijk debet én credit hebben");
    }
    if (d === 0 && c === 0) {
      throw new Error("Lege regel (geen debet, geen credit) niet toegestaan");
    }
    totalDebit += d;
    totalCredit += c;
  }
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Boeking onbalans: debet ${totalDebit} ≠ credit ${totalCredit} (cents)`,
    );
  }

  // Periode check
  const [yearStr, monthStr] = input.date.split("-");
  const year = parseInt(yearStr || "0");
  const month = parseInt(monthStr || "0");
  if (!year || !month) {
    throw new Error(`Ongeldige datum: ${input.date}`);
  }
  const period = getDb()
    .prepare(
      "SELECT status FROM accounting_periods WHERE tenant_id = ? AND year = ? AND month = ?",
    )
    .get(getCurrentTenantId(), year, month) as
    | { status: string }
    | undefined;
  if (period && period.status === "closed") {
    throw new Error(
      `Periode ${year}-${String(month).padStart(2, "0")} is afgesloten — boekingen niet toegestaan`,
    );
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO journal_entries
         (id, tenant_id, company_id, date, description, source_type,
          source_id, locked, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).run(
      id,
      getCurrentTenantId(),
      input.company_id ?? null,
      input.date,
      input.description,
      input.source_type,
      input.source_id ?? null,
      input.notes ?? null,
      now,
      input.created_by ?? "system",
    );

    const insertLine = db.prepare(
      `INSERT INTO journal_lines
         (id, journal_entry_id, account_code, description, debit_cents,
          credit_cents, vat_code, client_id, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of input.lines) {
      insertLine.run(
        crypto.randomUUID(),
        id,
        l.account_code,
        l.description ?? null,
        l.debit_cents || 0,
        l.credit_cents || 0,
        l.vat_code ?? null,
        l.client_id ?? null,
        l.supplier_id ?? null,
      );
    }

    // Zaai periode als die nog niet bestaat (status='open')
    db.prepare(
      `INSERT OR IGNORE INTO accounting_periods (tenant_id, year, month, status)
       VALUES (?, ?, ?, 'open')`,
    ).run(getCurrentTenantId(), year, month);
  });
  tx();

  return getEntryWithLines(id)!;
}

export function getEntryWithLines(id: string): JournalEntryWithLines | null {
  const db = getDb();
  const entry = db
    .prepare(
      "SELECT * FROM journal_entries WHERE id = ? AND tenant_id = ?",
    )
    .get(id, getCurrentTenantId()) as JournalEntry | undefined;
  if (!entry) return null;
  const lines = db
    .prepare(
      "SELECT * FROM journal_lines WHERE journal_entry_id = ? ORDER BY id",
    )
    .all(id) as JournalLine[];
  return { ...entry, lines };
}

export function listEntries(filter?: {
  from?: string;
  to?: string;
  source_type?: string;
  source_id?: string;
  account_code?: string;
}): JournalEntryWithLines[] {
  const db = getDb();
  const where: string[] = ["je.tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (filter?.from) {
    where.push("je.date >= ?");
    values.push(filter.from);
  }
  if (filter?.to) {
    where.push("je.date <= ?");
    values.push(filter.to);
  }
  if (filter?.source_type) {
    where.push("je.source_type = ?");
    values.push(filter.source_type);
  }
  if (filter?.source_id) {
    where.push("je.source_id = ?");
    values.push(filter.source_id);
  }
  if (filter?.account_code) {
    where.push(
      "EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.account_code = ?)",
    );
    values.push(filter.account_code);
  }
  const entries = db
    .prepare(
      `SELECT * FROM journal_entries je
       WHERE ${where.join(" AND ")}
       ORDER BY je.date DESC, je.created_at DESC
       LIMIT 500`,
    )
    .all(...values) as JournalEntry[];

  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.id);
  const lines = db
    .prepare(
      `SELECT * FROM journal_lines
       WHERE journal_entry_id IN (${ids.map(() => "?").join(",")})
       ORDER BY id`,
    )
    .all(...ids) as JournalLine[];
  const byEntry = new Map<string, JournalLine[]>();
  for (const l of lines) {
    const arr = byEntry.get(l.journal_entry_id) || [];
    arr.push(l);
    byEntry.set(l.journal_entry_id, arr);
  }
  return entries.map((e) => ({ ...e, lines: byEntry.get(e.id) || [] }));
}

export interface AccountLedgerLine {
  entry_id: string;
  date: string;
  description: string;
  source_type: string;
  source_id: string | null;
  line_description: string | null;
  debit_cents: number;
  credit_cents: number;
  running_balance_cents: number; // cumulative debit - credit (positief = debet)
}

/**
 * Grootboekkaart: alle mutaties op een rekening binnen [from, to],
 * chronologisch met running balance. Toont per regel:
 *   - bron-document
 *   - debet/credit
 *   - lopend saldo (debet - credit cumulatief)
 *
 * Optioneel: opening_balance voor het saldo aan het begin van de periode
 * (alle mutaties tot from). Vooral nuttig op rapport-pagina's waar je
 * "saldo per 1 januari" wil tonen voor een volledige reconstructie.
 */
export function getAccountLedger(
  accountCode: string,
  from: string,
  to: string,
): {
  opening_balance_cents: number;
  lines: AccountLedgerLine[];
  ending_balance_cents: number;
} {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  const opening = db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit_cents - jl.credit_cents), 0) AS bal
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.tenant_id = ? AND jl.account_code = ?
         AND je.date < ?`,
    )
    .get(tenantId, accountCode, from) as { bal: number };

  const rows = db
    .prepare(
      `SELECT je.id AS entry_id, je.date, je.description, je.source_type,
              je.source_id, jl.description AS line_description,
              jl.debit_cents, jl.credit_cents
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.tenant_id = ? AND jl.account_code = ?
         AND je.date BETWEEN ? AND ?
       ORDER BY je.date ASC, je.created_at ASC, jl.id ASC`,
    )
    .all(tenantId, accountCode, from, to) as Array<{
    entry_id: string;
    date: string;
    description: string;
    source_type: string;
    source_id: string | null;
    line_description: string | null;
    debit_cents: number;
    credit_cents: number;
  }>;

  let running = opening.bal;
  const lines: AccountLedgerLine[] = rows.map((r) => {
    running += r.debit_cents - r.credit_cents;
    return { ...r, running_balance_cents: running };
  });

  return {
    opening_balance_cents: opening.bal,
    lines,
    ending_balance_cents: running,
  };
}

/**
 * Reverseer een boeking: maak een nieuwe entry met debit↔credit omgewisseld
 * en koppel beide via reverses_id / reversed_by. Gebruikt voor correcties.
 */
export function reverseEntry(
  id: string,
  reason: string,
): JournalEntryWithLines {
  const original = getEntryWithLines(id);
  if (!original) throw new Error("Boeking bestaat niet");
  if (original.reversed_by) {
    throw new Error("Boeking is al gereverseerd");
  }
  if (original.reverses_id) {
    throw new Error("Reversal kan zelf niet gereverseerd worden");
  }

  const reversed = post({
    date: new Date().toISOString().slice(0, 10),
    description: `Reversal: ${original.description} — ${reason}`,
    source_type: original.source_type as PostInput["source_type"],
    source_id: original.source_id,
    notes: `Tegenboeking van ${original.id}`,
    created_by: "system",
    lines: original.lines.map((l) => ({
      account_code: l.account_code,
      description: l.description,
      debit_cents: l.credit_cents,
      credit_cents: l.debit_cents,
      vat_code: l.vat_code,
      client_id: l.client_id,
      supplier_id: l.supplier_id,
    })),
  });

  // Link beide
  const db = getDb();
  db.prepare("UPDATE journal_entries SET reversed_by = ? WHERE id = ?").run(
    reversed.id,
    id,
  );
  db.prepare("UPDATE journal_entries SET reverses_id = ? WHERE id = ?").run(
    id,
    reversed.id,
  );
  return reversed;
}
