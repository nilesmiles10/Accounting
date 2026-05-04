import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  kvk: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export type ClientUpdate = Partial<
  Omit<Client, "id" | "created_at" | "updated_at">
>;

const UPDATABLE: (keyof ClientUpdate)[] = [
  "name",
  "contact_name",
  "email",
  "phone",
  "kvk",
  "vat_number",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "country",
  "notes",
];

export interface ClientListItem extends Client {
  invoice_count: number;
}

export function listClients(search?: string): ClientListItem[] {
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const base = `
    SELECT c.*,
           (SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id) AS invoice_count
    FROM clients c
    WHERE c.tenant_id = ?
  `;
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    return db
      .prepare(
        `${base}
           AND (lower(c.name) LIKE ? OR lower(COALESCE(c.email,'')) LIKE ? OR lower(COALESCE(c.city,'')) LIKE ?)
         ORDER BY c.name`,
      )
      .all(tenantId, q, q, q) as ClientListItem[];
  }
  return db.prepare(`${base} ORDER BY c.name`).all(tenantId) as ClientListItem[];
}

export function getClient(id: string): Client | null {
  const row = getDb()
    .prepare("SELECT * FROM clients WHERE id = ? AND tenant_id = ?")
    .get(id, getCurrentTenantId()) as Client | undefined;
  return row ?? null;
}

export function createClient(input: { name: string } & ClientUpdate): Client {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO clients (id, tenant_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, getCurrentTenantId(), input.name, now, now);
  if (Object.keys(input).length > 1) {
    updateClient(id, input);
  }
  return getClient(id)!;
}

export function updateClient(
  id: string,
  patch: ClientUpdate,
): Client | null {
  const db = getDb();
  const fields = UPDATABLE.filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return getClient(id);

  const setSql = fields.map((k) => `${k} = ?`).join(", ");
  const values = fields.map((k) => patch[k] as unknown);
  db.prepare(
    `UPDATE clients SET ${setSql}, updated_at = ? WHERE id = ?`,
  ).run(...values, Date.now(), id);
  return getClient(id);
}

export function deleteClient(id: string): boolean {
  const db = getDb();
  const inUse = db
    .prepare("SELECT COUNT(*) AS n FROM invoices WHERE client_id = ?")
    .get(id) as { n: number };
  if (inUse.n > 0) {
    throw new Error("Klant heeft facturen en kan niet worden verwijderd");
  }
  const res = db.prepare("DELETE FROM clients WHERE id = ?").run(id);
  return res.changes > 0;
}
