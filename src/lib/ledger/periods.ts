import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";
import { post } from "./journal";
import { generateVatReport, quarterRange } from "@/lib/reports/vat";

export type Quarter = 1 | 2 | 3 | 4;

export function quarterMonths(q: Quarter): [number, number, number] {
  return [q * 3 - 2, q * 3 - 1, q * 3];
}

/**
 * Sluit een BTW-kwartaal: zet alle 3 maanden op 'closed' in
 * accounting_periods. Boekingen met datum in het kwartaal worden
 * daarna geweigerd door journal.post().
 *
 * Idempotent — al-gesloten maanden blijven gesloten.
 */
export function closeQuarter(year: number, q: Quarter): void {
  const months = quarterMonths(q);
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const m of months) {
      db.prepare(
        `INSERT INTO accounting_periods (tenant_id, year, month, status, closed_at)
         VALUES (?, ?, ?, 'closed', ?)
         ON CONFLICT(tenant_id, year, month) DO UPDATE SET
           status = 'closed', closed_at = excluded.closed_at`,
      ).run(tenantId, year, m, now);
    }
  });
  tx();
}

export function reopenQuarter(year: number, q: Quarter): void {
  const months = quarterMonths(q);
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const tx = db.transaction(() => {
    for (const m of months) {
      db.prepare(
        `UPDATE accounting_periods SET status = 'open', closed_at = NULL
         WHERE tenant_id = ? AND year = ? AND month = ?`,
      ).run(tenantId, year, m);
    }
  });
  tx();
}

export function isQuarterClosed(year: number, q: Quarter): boolean {
  const months = quarterMonths(q);
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const rows = db
    .prepare(
      `SELECT status FROM accounting_periods
       WHERE tenant_id = ? AND year = ? AND month IN (?, ?, ?)`,
    )
    .all(tenantId, year, months[0], months[1], months[2]) as Array<{
    status: string;
  }>;
  // Alleen "closed" als alle 3 expliciet gesloten zijn
  if (rows.length < 3) return false;
  return rows.every((r) => r.status === "closed");
}

export interface VatSubmission {
  year: number;
  quarter: Quarter;
  submitted_at: number;
  base_cents: number;
  to_pay_cents: number;
  payment_journal_id: string | null;
}

/**
 * Boekt de BTW-afdracht (of retour) en sluit het kwartaal.
 *
 * Te-betalen scenario (to_pay_cents > 0):
 *   Debet 1700 BTW te betalen
 *   Credit 1100 Bank
 *
 * Retour scenario (to_pay_cents < 0):
 *   Debet 1100 Bank
 *   Credit 1500 BTW vorderingen
 *
 * Saldo 0: geen journaal, alleen kwartaal sluiten.
 *
 * Daarna wordt het kwartaal afgesloten via closeQuarter zodat late
 * mutaties niet meer in dit BTW-tijdvak landen — die horen in een
 * suppletie of het volgende kwartaal.
 */
export function submitVatQuarter(input: {
  year: number;
  quarter: Quarter;
  paid_date: string; // YYYY-MM-DD
  bank_account_code?: string;
}): VatSubmission {
  const range = quarterRange(input.year, input.quarter);
  const report = generateVatReport(range.from, range.to);
  const bankCode = input.bank_account_code || "1100";
  const toPay = report.to_pay_cents;
  let journalId: string | null = null;

  if (toPay > 0) {
    const entry = post({
      date: input.paid_date,
      description: `BTW-afdracht ${input.year}-Q${input.quarter}`,
      source_type: "vat_submission",
      source_id: `${input.year}-Q${input.quarter}`,
      lines: [
        {
          account_code: "1700",
          description: `BTW te betalen ${input.year}-Q${input.quarter}`,
          debit_cents: toPay,
        },
        {
          account_code: bankCode,
          description: `Afgedragen aan Belastingdienst`,
          credit_cents: toPay,
        },
      ],
    });
    journalId = entry.id;
  } else if (toPay < 0) {
    const refund = -toPay;
    const entry = post({
      date: input.paid_date,
      description: `BTW-teruggaaf ${input.year}-Q${input.quarter}`,
      source_type: "vat_submission",
      source_id: `${input.year}-Q${input.quarter}`,
      lines: [
        {
          account_code: bankCode,
          description: `Teruggaaf van Belastingdienst`,
          debit_cents: refund,
        },
        {
          account_code: "1500",
          description: `BTW vorderingen ${input.year}-Q${input.quarter}`,
          credit_cents: refund,
        },
      ],
    });
    journalId = entry.id;
  }

  // Sluit kwartaal pas NA succesvolle boeking — anders blijft 't open
  // zodat de gebruiker kan corrigeren.
  closeQuarter(input.year, input.quarter);

  // Log de aangifte zelf
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vat_submissions
       (tenant_id, year, quarter, submitted_at, base_cents,
        to_pay_cents, payment_journal_id, paid_date, bank_account_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    getCurrentTenantId(),
    input.year,
    input.quarter,
    Date.now(),
    report.rubrics
      .filter((r) => r.rubric.startsWith("1") || r.rubric.startsWith("3"))
      .reduce((s, r) => s + Math.abs(r.base_cents), 0),
    toPay,
    journalId,
    input.paid_date,
    bankCode,
  );

  return {
    year: input.year,
    quarter: input.quarter,
    submitted_at: Date.now(),
    base_cents: report.rubrics
      .filter((r) => r.rubric.startsWith("1") || r.rubric.startsWith("3"))
      .reduce((s, r) => s + Math.abs(r.base_cents), 0),
    to_pay_cents: toPay,
    payment_journal_id: journalId,
  };
}

export function getVatSubmission(
  year: number,
  q: Quarter,
): VatSubmission | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT year, quarter, submitted_at, base_cents,
              to_pay_cents, payment_journal_id
       FROM vat_submissions
       WHERE tenant_id = ? AND year = ? AND quarter = ?`,
    )
    .get(getCurrentTenantId(), year, q) as VatSubmission | undefined;
  return row || null;
}

export function listVatSubmissions(): VatSubmission[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT year, quarter, submitted_at, base_cents,
              to_pay_cents, payment_journal_id
       FROM vat_submissions
       WHERE tenant_id = ?
       ORDER BY year DESC, quarter DESC`,
    )
    .all(getCurrentTenantId()) as VatSubmission[];
}
