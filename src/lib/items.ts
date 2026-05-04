import crypto from "crypto";
import { getDb } from "@/lib/db";

export interface Item {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  unit: string | null;
  unit_price_cents: number;
  vat_rate: number;
  active: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export type ItemUpdate = Partial<
  Omit<Item, "id" | "company_id" | "created_at" | "updated_at">
>;

const UPDATABLE: (keyof ItemUpdate)[] = [
  "name",
  "description",
  "unit",
  "unit_price_cents",
  "vat_rate",
  "active",
  "sort_order",
];

export function listItems(
  companyId: string,
  opts: { activeOnly?: boolean } = {},
): Item[] {
  const db = getDb();
  if (opts.activeOnly) {
    return db
      .prepare(
        "SELECT * FROM items WHERE company_id = ? AND active = 1 ORDER BY sort_order, name",
      )
      .all(companyId) as Item[];
  }
  return db
    .prepare(
      "SELECT * FROM items WHERE company_id = ? ORDER BY active DESC, sort_order, name",
    )
    .all(companyId) as Item[];
}

export function getItem(id: string): Item | null {
  const row = getDb()
    .prepare("SELECT * FROM items WHERE id = ?")
    .get(id) as Item | undefined;
  return row ?? null;
}

export function createItem(input: {
  company_id: string;
  name: string;
} & ItemUpdate): Item {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO items (id, company_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.company_id, input.name, now, now);
  if (Object.keys(input).length > 2) {
    updateItem(id, input);
  }
  return getItem(id)!;
}

export function updateItem(id: string, patch: ItemUpdate): Item | null {
  const db = getDb();
  const fields = UPDATABLE.filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return getItem(id);
  const setSql = fields.map((k) => `${k} = ?`).join(", ");
  const values = fields.map((k) => patch[k] as unknown);
  db.prepare(
    `UPDATE items SET ${setSql}, updated_at = ? WHERE id = ?`,
  ).run(...values, Date.now(), id);
  return getItem(id);
}

export function deleteItem(id: string): boolean {
  const res = getDb().prepare("DELETE FROM items WHERE id = ?").run(id);
  return res.changes > 0;
}
