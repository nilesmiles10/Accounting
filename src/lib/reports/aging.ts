import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface AgingRow {
  id: string;
  number: string;
  party_name: string;        // klant of leverancier
  due_date: string;
  total_cents: number;
  days_overdue: number;      // negatief = nog niet vervallen
  bucket: "current" | "30" | "60" | "90" | "90+";
}

export interface AgingReport {
  as_of: string;
  rows: AgingRow[];
  total_cents: number;
  by_bucket: Record<AgingRow["bucket"], number>;
}

function bucketize(daysOverdue: number): AgingRow["bucket"] {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "30";
  if (daysOverdue <= 60) return "60";
  if (daysOverdue <= 90) return "90";
  return "90+";
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Aging-rapport debiteuren — openstaande verkoopfacturen, niet
 * gecreditenoteerd of geannuleerd, gegroepeerd per leeftijd.
 *
 * Gebruikt invoices.due_date en peilt ten opzichte van as_of.
 * Verkoopfacturen status sent/overdue tellen mee; paid/cancelled niet.
 */
export function generateDebtorAging(asOf?: string): AgingReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const peil = asOf || new Date().toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT i.id, i.number, c.name AS party_name, i.due_date, i.total_cents
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.tenant_id = ?
         AND i.status IN ('sent', 'overdue')
         AND i.is_credit_note = 0
       ORDER BY i.due_date ASC`,
    )
    .all(tenantId) as Array<{
    id: string;
    number: string;
    party_name: string;
    due_date: string;
    total_cents: number;
  }>;

  const result: AgingRow[] = rows.map((r) => {
    const days = daysBetween(r.due_date, peil);
    return { ...r, days_overdue: days, bucket: bucketize(days) };
  });

  const byBucket: AgingReport["by_bucket"] = {
    current: 0,
    "30": 0,
    "60": 0,
    "90": 0,
    "90+": 0,
  };
  for (const r of result) byBucket[r.bucket] += r.total_cents;

  return {
    as_of: peil,
    rows: result,
    total_cents: result.reduce((s, r) => s + r.total_cents, 0),
    by_bucket: byBucket,
  };
}

/**
 * Aging-rapport crediteuren — goedgekeurde inkoopfacturen die nog niet
 * betaald zijn. Status approved telt; paid/cancelled niet.
 */
export function generateCreditorAging(asOf?: string): AgingReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const peil = asOf || new Date().toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT p.id,
              COALESCE(p.supplier_invoice_number, substr(p.id, 1, 8)) AS number,
              s.name AS party_name,
              COALESCE(p.due_date, p.issue_date) AS due_date,
              p.total_cents
       FROM purchase_invoices p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.tenant_id = ?
         AND p.status = 'approved'
       ORDER BY due_date ASC`,
    )
    .all(tenantId) as Array<{
    id: string;
    number: string;
    party_name: string | null;
    due_date: string;
    total_cents: number;
  }>;

  const result: AgingRow[] = rows.map((r) => {
    const days = daysBetween(r.due_date, peil);
    return {
      ...r,
      party_name: r.party_name || "Onbekende leverancier",
      days_overdue: days,
      bucket: bucketize(days),
    };
  });

  const byBucket: AgingReport["by_bucket"] = {
    current: 0,
    "30": 0,
    "60": 0,
    "90": 0,
    "90+": 0,
  };
  for (const r of result) byBucket[r.bucket] += r.total_cents;

  return {
    as_of: peil,
    rows: result,
    total_cents: result.reduce((s, r) => s + r.total_cents, 0),
    by_bucket: byBucket,
  };
}
