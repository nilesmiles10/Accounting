import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface BalanceLine {
  code: string;
  name: string;
  amount_cents: number;
}

export interface BalanceReport {
  as_of: string;
  assets: BalanceLine[];
  assets_total: number;
  liabilities: BalanceLine[];
  liabilities_total: number;
  equity_lines: BalanceLine[]; // expliciete equity-rekeningen
  equity_total: number;
  retained_earnings_cents: number; // sum(income) - sum(expense) tot peildatum
  total_passiva_cents: number;     // liabilities + equity + retained
  imbalance_cents: number;         // assets - total_passiva (zou 0 moeten zijn)
}

/**
 * Balans op peildatum.
 *
 * Activa-saldo per rekening = debet - credit (positief teken)
 * Passiva-saldo per rekening = credit - debet (positief teken)
 * Eigen vermogen = expliciete equity-rekeningen + retained earnings
 *   (cumulatieve winst tot peildatum)
 *
 * Imbalance moet 0 zijn; anders zit er ergens een fout in de boekingen.
 */
export function generateBalance(asOf: string): BalanceReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  const assetRows = db
    .prepare(
      `SELECT a.code, a.name,
              COALESCE(SUM(jl.debit_cents), 0) - COALESCE(SUM(jl.credit_cents), 0) AS amount
       FROM chart_of_accounts a
       LEFT JOIN journal_lines jl ON jl.account_code = a.code
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.tenant_id = ? AND je.date <= ?
       WHERE a.tenant_id = ? AND a.type = 'asset'
       GROUP BY a.code, a.name
       HAVING amount != 0
       ORDER BY a.code`,
    )
    .all(tenantId, asOf, tenantId) as Array<{
    code: string;
    name: string;
    amount: number;
  }>;

  const liabRows = db
    .prepare(
      `SELECT a.code, a.name,
              COALESCE(SUM(jl.credit_cents), 0) - COALESCE(SUM(jl.debit_cents), 0) AS amount
       FROM chart_of_accounts a
       LEFT JOIN journal_lines jl ON jl.account_code = a.code
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.tenant_id = ? AND je.date <= ?
       WHERE a.tenant_id = ? AND a.type = 'liability'
       GROUP BY a.code, a.name
       HAVING amount != 0
       ORDER BY a.code`,
    )
    .all(tenantId, asOf, tenantId) as Array<{
    code: string;
    name: string;
    amount: number;
  }>;

  const equityRows = db
    .prepare(
      `SELECT a.code, a.name,
              COALESCE(SUM(jl.credit_cents), 0) - COALESCE(SUM(jl.debit_cents), 0) AS amount
       FROM chart_of_accounts a
       LEFT JOIN journal_lines jl ON jl.account_code = a.code
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.tenant_id = ? AND je.date <= ?
       WHERE a.tenant_id = ? AND a.type = 'equity'
       GROUP BY a.code, a.name
       HAVING amount != 0
       ORDER BY a.code`,
    )
    .all(tenantId, asOf, tenantId) as Array<{
    code: string;
    name: string;
    amount: number;
  }>;

  // Retained earnings = cumulatieve winst tot peildatum
  const earnings = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN a.type='income' THEN jl.credit_cents - jl.debit_cents ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN a.type='expense' THEN jl.debit_cents - jl.credit_cents ELSE 0 END), 0) AS expense
       FROM journal_lines jl
       JOIN chart_of_accounts a ON a.code = jl.account_code AND a.tenant_id = ?
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.tenant_id = ? AND je.date <= ?`,
    )
    .get(tenantId, tenantId, asOf) as { income: number; expense: number };

  const retainedEarnings = earnings.income - earnings.expense;

  const assets: BalanceLine[] = assetRows.map((r) => ({
    code: r.code,
    name: r.name,
    amount_cents: r.amount,
  }));
  const liabilities: BalanceLine[] = liabRows.map((r) => ({
    code: r.code,
    name: r.name,
    amount_cents: r.amount,
  }));
  const equityLines: BalanceLine[] = equityRows.map((r) => ({
    code: r.code,
    name: r.name,
    amount_cents: r.amount,
  }));

  const assetsTotal = assets.reduce((s, l) => s + l.amount_cents, 0);
  const liabTotal = liabilities.reduce((s, l) => s + l.amount_cents, 0);
  const equityExplicit = equityLines.reduce((s, l) => s + l.amount_cents, 0);
  const totalPassiva = liabTotal + equityExplicit + retainedEarnings;

  return {
    as_of: asOf,
    assets,
    assets_total: assetsTotal,
    liabilities,
    liabilities_total: liabTotal,
    equity_lines: equityLines,
    equity_total: equityExplicit,
    retained_earnings_cents: retainedEarnings,
    total_passiva_cents: totalPassiva,
    imbalance_cents: assetsTotal - totalPassiva,
  };
}
