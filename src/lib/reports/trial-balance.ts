import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface TrialBalanceLine {
  code: string;
  name: string;
  type: string;
  debit_total_cents: number;
  credit_total_cents: number;
  balance_cents: number; // debit - credit (positief = debetsaldo)
}

export interface TrialBalanceReport {
  from: string;
  to: string;
  lines: TrialBalanceLine[];
  debit_grand_total: number;
  credit_grand_total: number;
  // Sanity: debit_grand_total == credit_grand_total (anders bug in DB)
  in_balance: boolean;
}

/**
 * Proefbalans / kolommenbalans over [from, to].
 *
 * Per rekening: som debet en credit van álle journal_lines binnen de
 * periode. Saldo = debet - credit. Activa en kosten hebben normaal
 * een positief saldo, passiva en omzet een negatief.
 *
 * De totalen onderaan moeten exact gelijk zijn — dat is dé sanity-check
 * voor accountants. Als ze NIET gelijk zijn is er ergens een ongeldige
 * boeking, wat in onze setup niet kan ontstaan (post() valideert
 * balance per entry), maar de check houden we als safety net.
 */
export function generateTrialBalance(
  from: string,
  to: string,
): TrialBalanceReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  const rows = db
    .prepare(
      `SELECT a.code, a.name, a.type,
              COALESCE(SUM(jl.debit_cents), 0) AS debit,
              COALESCE(SUM(jl.credit_cents), 0) AS credit
       FROM chart_of_accounts a
       LEFT JOIN journal_lines jl ON jl.account_code = a.code
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.tenant_id = ? AND je.date BETWEEN ? AND ?
       WHERE a.tenant_id = ?
       GROUP BY a.code, a.name, a.type
       HAVING debit > 0 OR credit > 0
       ORDER BY a.code`,
    )
    .all(tenantId, from, to, tenantId) as Array<{
    code: string;
    name: string;
    type: string;
    debit: number;
    credit: number;
  }>;

  const lines: TrialBalanceLine[] = rows.map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    debit_total_cents: r.debit,
    credit_total_cents: r.credit,
    balance_cents: r.debit - r.credit,
  }));

  const debitTotal = lines.reduce((s, l) => s + l.debit_total_cents, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit_total_cents, 0);

  return {
    from,
    to,
    lines,
    debit_grand_total: debitTotal,
    credit_grand_total: creditTotal,
    in_balance: debitTotal === creditTotal,
  };
}
