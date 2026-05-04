import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

/**
 * Geeft de eerste boekingsdatum + het aantal facturen dat (nog) géén
 * journal_entry heeft. Voor de banner op rapport-pages: "data vanaf X
 * — N oudere facturen tellen niet mee".
 */
export interface CoverageInfo {
  first_journal_date: string | null;
  invoices_without_journal: number;
  purchases_without_journal: number;
}

export function getCoverageInfo(): CoverageInfo {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  const first = db
    .prepare(
      "SELECT MIN(date) AS d FROM journal_entries WHERE tenant_id = ?",
    )
    .get(tenantId) as { d: string | null };

  const invoiceMissed = db
    .prepare(
      `SELECT COUNT(*) AS n FROM invoices i
       WHERE i.tenant_id = ?
         AND i.status IN ('sent','paid','overdue')
         AND NOT EXISTS (
           SELECT 1 FROM journal_entries je
           WHERE je.source_type = 'invoice' AND je.source_id = i.id
         )`,
    )
    .get(tenantId) as { n: number };

  const purchaseMissed = db
    .prepare(
      `SELECT COUNT(*) AS n FROM purchase_invoices p
       WHERE p.tenant_id = ?
         AND p.status IN ('approved','paid')
         AND NOT EXISTS (
           SELECT 1 FROM journal_entries je
           WHERE je.source_type = 'purchase' AND je.source_id = p.id
         )`,
    )
    .get(tenantId) as { n: number };

  return {
    first_journal_date: first.d,
    invoices_without_journal: invoiceMissed.n,
    purchases_without_journal: purchaseMissed.n,
  };
}
