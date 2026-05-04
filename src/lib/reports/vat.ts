import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface VatRubric {
  rubric: string;
  label: string;
  base_cents: number;
  vat_cents: number;
}

export interface VatReport {
  from: string;
  to: string;
  rubrics: VatRubric[];
  to_pay_cents: number; // 5g — saldo te betalen / te ontvangen
}

/**
 * BTW-aangifte cijfers per kwartaal/periode.
 *
 * Mapping vat_code → rubriek:
 *   "21"   → 1a (21% binnenland)
 *   "9"    → 1b (9% binnenland)
 *   "0"    → 1e (0% binnenland / vrijgesteld) — alleen omzet-side
 *   "0EU"  → 3b (intracommunautair B2B verlegd)
 *   "0EX"  → 3a (export buiten EU)
 *
 * Voorbelasting (5b) = totaal debet op rekening 1500 in periode.
 * Te betalen (5g) = 1a-vat + 1b-vat + 1c-vat - 5b.
 *
 * Belangrijk: we gebruiken de vat_code op income-side journal_lines
 * voor 1a/1b/1c/3a/3b. Voor 5b sommen we direct op rekening 1500
 * (die wordt geboekt bij goedgekeurde inkoopfacturen met BTW > 0).
 */
export function generateVatReport(from: string, to: string): VatReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  // Helper: som credit-side van income-rekeningen met specifieke vat_code
  // (basis = grondslag, debet-side hoort niet bij omzet)
  function getOmzet(vatCode: string): { base: number; vat: number } {
    const incomeRow = db
      .prepare(
        `SELECT COALESCE(SUM(jl.credit_cents - jl.debit_cents), 0) AS base
         FROM journal_lines jl
         JOIN chart_of_accounts a ON a.code = jl.account_code AND a.tenant_id = ?
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.tenant_id = ? AND je.date BETWEEN ? AND ?
           AND a.type = 'income'
           AND jl.vat_code = ?`,
      )
      .get(tenantId, tenantId, from, to, vatCode) as { base: number };

    // BTW-bedrag voor dit vat-tarief = credit op 1700 met zelfde vat_code
    const vatRow = db
      .prepare(
        `SELECT COALESCE(SUM(jl.credit_cents - jl.debit_cents), 0) AS vat
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.tenant_id = ? AND je.date BETWEEN ? AND ?
           AND jl.account_code = '1700'
           AND jl.vat_code = ?`,
      )
      .get(tenantId, from, to, vatCode) as { vat: number };

    return { base: incomeRow.base, vat: vatRow.vat };
  }

  const r1a = getOmzet("21");
  const r1b = getOmzet("9");
  const r1e = getOmzet("0");
  const r3a = getOmzet("0EX");
  const r3b = getOmzet("0EU");

  // 5b voorbelasting: debet op 1500
  const voorbelasting = db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit_cents - jl.credit_cents), 0) AS amount
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.tenant_id = ? AND je.date BETWEEN ? AND ?
         AND jl.account_code = '1500'`,
    )
    .get(tenantId, from, to) as { amount: number };

  // Grondslag voorbelasting: som van debet op expense-rekeningen waar
  // vat_code != '0' / null (proxy voor "BTW-relevante kosten")
  const voorbelastingBase = db
    .prepare(
      `SELECT COALESCE(SUM(jl.debit_cents - jl.credit_cents), 0) AS amount
       FROM journal_lines jl
       JOIN chart_of_accounts a ON a.code = jl.account_code AND a.tenant_id = ?
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.tenant_id = ? AND je.date BETWEEN ? AND ?
         AND a.type = 'expense'
         AND jl.vat_code IS NOT NULL
         AND jl.vat_code != '0'`,
    )
    .get(tenantId, tenantId, from, to) as { amount: number };

  const rubrics: VatRubric[] = [
    {
      rubric: "1a",
      label: "Leveringen/diensten 21%",
      base_cents: r1a.base,
      vat_cents: r1a.vat,
    },
    {
      rubric: "1b",
      label: "Leveringen/diensten 9%",
      base_cents: r1b.base,
      vat_cents: r1b.vat,
    },
    {
      rubric: "1e",
      label: "Leveringen/diensten 0% / vrijgesteld",
      base_cents: r1e.base,
      vat_cents: 0,
    },
    {
      rubric: "3a",
      label: "Export buiten EU",
      base_cents: r3a.base,
      vat_cents: 0,
    },
    {
      rubric: "3b",
      label: "Intracommunautair B2B (verlegd)",
      base_cents: r3b.base,
      vat_cents: 0,
    },
    {
      rubric: "5b",
      label: "Voorbelasting (aftrekbaar)",
      base_cents: voorbelastingBase.amount,
      vat_cents: voorbelasting.amount,
    },
  ];

  const totalVatOut = r1a.vat + r1b.vat;
  const totalVatIn = voorbelasting.amount;
  const toPay = totalVatOut - totalVatIn;

  return {
    from,
    to,
    rubrics,
    to_pay_cents: toPay,
  };
}

/** Convenience: genereer rapport voor een specifiek kwartaal van een jaar. */
export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): {
  from: string;
  to: string;
} {
  const startMonth = (quarter - 1) * 3 + 1; // 1, 4, 7, 10
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate(); // dag-0 van volgende = laatste dag
  return {
    from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    to: `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}
