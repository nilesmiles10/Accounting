import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface PnLLine {
  code: string;
  name: string;
  amount_cents: number;
}

export interface PnLReport {
  from: string;
  to: string;
  company_id: string | null;
  income: PnLLine[];
  income_total: number;
  cost_of_sales: PnLLine[];
  cost_of_sales_total: number;
  expenses: PnLLine[];
  expenses_total: number;
  gross_profit_cents: number;     // income - cost_of_sales
  net_profit_cents: number;       // income - cost_of_sales - expenses
}

/**
 * Winst-en-verlies over periode [from, to], optioneel per company.
 *
 * company_id="" of null = gecombineerd over alle bedrijven van deze
 * tenant. Geef expliciet een UUID om alleen Intersumma/Maelilly/Kisou
 * te zien. Boekingen zonder company_id (handmatige posts, BTW-afdracht
 * etc.) tellen NIET mee in een bedrijfsspecifieke filter — die zie je
 * alleen op de gecombineerde view.
 *
 * Income = credit-saldo op income-rekeningen (8xxx, 9xxx)
 * Kosten = debit-saldo op expense-rekeningen (4xxx, 7xxx)
 *
 * 7000 Inkoopwaarde wordt apart getoond als "kostprijs van de omzet"
 * zodat je bruto- en netto-winst onafhankelijk kunt zien.
 */
export function generatePnL(
  from: string,
  to: string,
  companyId?: string | null,
): PnLReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const companyFilter = companyId
    ? `AND je.company_id = ?`
    : ``;
  const companyParams = companyId ? [companyId] : [];

  const incomeRows = db
    .prepare(
      `SELECT a.code, a.name,
              COALESCE(SUM(jl.credit_cents), 0) - COALESCE(SUM(jl.debit_cents), 0) AS amount
       FROM chart_of_accounts a
       LEFT JOIN journal_lines jl ON jl.account_code = a.code
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.tenant_id = ? AND je.date BETWEEN ? AND ?
         ${companyFilter}
       WHERE a.tenant_id = ? AND a.type = 'income'
       GROUP BY a.code, a.name
       HAVING amount != 0
       ORDER BY a.code`,
    )
    .all(tenantId, from, to, ...companyParams, tenantId) as Array<{
    code: string;
    name: string;
    amount: number;
  }>;

  const expenseRows = db
    .prepare(
      `SELECT a.code, a.name,
              COALESCE(SUM(jl.debit_cents), 0) - COALESCE(SUM(jl.credit_cents), 0) AS amount
       FROM chart_of_accounts a
       LEFT JOIN journal_lines jl ON jl.account_code = a.code
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.tenant_id = ? AND je.date BETWEEN ? AND ?
         ${companyFilter}
       WHERE a.tenant_id = ? AND a.type = 'expense'
       GROUP BY a.code, a.name
       HAVING amount != 0
       ORDER BY a.code`,
    )
    .all(tenantId, from, to, ...companyParams, tenantId) as Array<{
    code: string;
    name: string;
    amount: number;
  }>;

  const income: PnLLine[] = incomeRows.map((r) => ({
    code: r.code,
    name: r.name,
    amount_cents: r.amount,
  }));
  const incomeTotal = income.reduce((s, l) => s + l.amount_cents, 0);

  // Splits: 7000-7999 = inkoopwaarde (cost of sales), rest = expenses
  const cos = expenseRows
    .filter((r) => r.code.startsWith("7"))
    .map((r) => ({ code: r.code, name: r.name, amount_cents: r.amount }));
  const exp = expenseRows
    .filter((r) => !r.code.startsWith("7"))
    .map((r) => ({ code: r.code, name: r.name, amount_cents: r.amount }));

  const cosTotal = cos.reduce((s, l) => s + l.amount_cents, 0);
  const expTotal = exp.reduce((s, l) => s + l.amount_cents, 0);

  return {
    from,
    to,
    company_id: companyId || null,
    income,
    income_total: incomeTotal,
    cost_of_sales: cos,
    cost_of_sales_total: cosTotal,
    expenses: exp,
    expenses_total: expTotal,
    gross_profit_cents: incomeTotal - cosTotal,
    net_profit_cents: incomeTotal - cosTotal - expTotal,
  };
}
