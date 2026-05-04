import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  legal_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  kvk: string | null;
  vat_number: string | null;
  iban: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  default_account_code: string | null;
  default_vat_rate: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export type SupplierUpdate = Partial<
  Omit<Supplier, "id" | "tenant_id" | "created_at" | "updated_at">
>;

const UPDATABLE: (keyof SupplierUpdate)[] = [
  "name",
  "legal_name",
  "contact_name",
  "email",
  "phone",
  "kvk",
  "vat_number",
  "iban",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "country",
  "default_account_code",
  "default_vat_rate",
  "notes",
];

export interface SupplierListItem extends Supplier {
  invoice_count: number;
  total_spent_cents: number;
}

export function listSuppliers(search?: string): SupplierListItem[] {
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const base = `
    SELECT s.*,
      (SELECT COUNT(*) FROM purchase_invoices p WHERE p.supplier_id = s.id) AS invoice_count,
      (SELECT COALESCE(SUM(p.total_cents), 0) FROM purchase_invoices p
       WHERE p.supplier_id = s.id AND p.status IN ('approved','paid')) AS total_spent_cents
    FROM suppliers s
    WHERE s.tenant_id = ?
  `;
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    return db
      .prepare(
        `${base}
           AND (lower(s.name) LIKE ? OR lower(COALESCE(s.email,'')) LIKE ?
                OR lower(COALESCE(s.kvk,'')) LIKE ?
                OR lower(COALESCE(s.vat_number,'')) LIKE ?)
         ORDER BY s.name`,
      )
      .all(tenantId, q, q, q, q) as SupplierListItem[];
  }
  return db
    .prepare(`${base} ORDER BY s.name`)
    .all(tenantId) as SupplierListItem[];
}

export function getSupplier(id: string): Supplier | null {
  const row = getDb()
    .prepare("SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?")
    .get(id, getCurrentTenantId()) as Supplier | undefined;
  return row ?? null;
}

/**
 * Match een leverancier op basis van OCR-data. Probeert:
 *   1. Exact KvK-nummer match
 *   2. Exact VAT-nummer match
 *   3. Exact IBAN match
 *   4. Naam-fuzzy match (lowercased substring)
 * Returnt null als geen match.
 */
export function matchSupplier(criteria: {
  kvk?: string | null;
  vat_number?: string | null;
  iban?: string | null;
  name?: string | null;
}): Supplier | null {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  if (criteria.kvk && criteria.kvk.trim()) {
    const row = db
      .prepare(
        "SELECT * FROM suppliers WHERE tenant_id = ? AND kvk = ? LIMIT 1",
      )
      .get(tenantId, criteria.kvk.trim()) as Supplier | undefined;
    if (row) return row;
  }
  if (criteria.vat_number && criteria.vat_number.trim()) {
    const row = db
      .prepare(
        "SELECT * FROM suppliers WHERE tenant_id = ? AND vat_number = ? LIMIT 1",
      )
      .get(tenantId, criteria.vat_number.trim()) as Supplier | undefined;
    if (row) return row;
  }
  if (criteria.iban && criteria.iban.trim()) {
    const row = db
      .prepare(
        "SELECT * FROM suppliers WHERE tenant_id = ? AND REPLACE(iban,' ','') = REPLACE(?,' ','') LIMIT 1",
      )
      .get(tenantId, criteria.iban.trim()) as Supplier | undefined;
    if (row) return row;
  }
  if (criteria.name && criteria.name.trim().length > 2) {
    const row = db
      .prepare(
        `SELECT * FROM suppliers WHERE tenant_id = ?
         AND lower(name) = lower(?) LIMIT 1`,
      )
      .get(tenantId, criteria.name.trim()) as Supplier | undefined;
    if (row) return row;
  }
  return null;
}

export function createSupplier(
  input: { name: string } & SupplierUpdate,
): Supplier {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO suppliers (id, tenant_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, getCurrentTenantId(), input.name, now, now);
  if (Object.keys(input).length > 1) {
    updateSupplier(id, input);
  }
  return getSupplier(id)!;
}

export function updateSupplier(
  id: string,
  patch: SupplierUpdate,
): Supplier | null {
  const db = getDb();
  const fields = UPDATABLE.filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return getSupplier(id);
  const setSql = fields.map((k) => `${k} = ?`).join(", ");
  const values = fields.map((k) => patch[k] as unknown);
  db.prepare(
    `UPDATE suppliers SET ${setSql}, updated_at = ? WHERE id = ? AND tenant_id = ?`,
  ).run(...values, Date.now(), id, getCurrentTenantId());
  return getSupplier(id);
}

export function deleteSupplier(id: string): boolean {
  const db = getDb();
  const inUse = db
    .prepare(
      "SELECT COUNT(*) AS n FROM purchase_invoices WHERE supplier_id = ?",
    )
    .get(id) as { n: number };
  if (inUse.n > 0) {
    throw new Error(
      "Leverancier heeft inkoopfacturen en kan niet worden verwijderd",
    );
  }
  const res = db
    .prepare("DELETE FROM suppliers WHERE id = ? AND tenant_id = ?")
    .run(id, getCurrentTenantId());
  return res.changes > 0;
}
