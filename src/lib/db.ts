/**
 * SQLite connection + migration runner for the accounting module.
 *
 * Deviation from the JSON atomic-store used elsewhere in Nova Control:
 * invoicing has relational data (companies → invoices → lines → events) and
 * this module is designed to grow into full bookkeeping. Relational from day
 * one avoids a painful migration later.
 */

import fs from "fs";
import path from "path";
import Database, { type Database as DB } from "better-sqlite3";
import { log } from "@/lib/logger";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const ACCOUNTING_DIR = path.join(DATA_DIR, "accounting");
const DB_PATH = path.join(ACCOUNTING_DIR, "accounting.db");
const MIGRATIONS_DIR = path.join(process.cwd(), "src/lib/accounting/migrations");

let cached: DB | null = null;

export function getDb(): DB {
  if (cached) return cached;

  fs.mkdirSync(ACCOUNTING_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  runMigrations(db);
  seedCompaniesIfEmpty(db);

  cached = db;
  // Eerste-run zaaien van NL-default rekeningschema. Doet niets als al
  // gevuld. Buiten cached toewijzing zodat ensureDefaultChartSeeded de
  // db-handle kan opvragen via getDb().
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const accounts = require("./ledger/accounts") as typeof import("./ledger/accounts");
    accounts.ensureDefaultChartSeeded();
  } catch {
    // accounts.ts niet beschikbaar bij eerste setup — negeer.
  }
  return db;
}

function runMigrations(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((r) => (r as { name: string }).name),
  );

  const insert = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const tx = db.transaction(() => {
      db.exec(sql);
      insert.run(file, Date.now());
    });
    tx();
    log.info({ scope: "accounting/db", migration: file }, "migration applied");
  }
}

/**
 * First-run seed: insert Intersumma and Kisou as empty rows so the companies
 * list is never empty. User fills in details via the UI.
 */
function seedCompaniesIfEmpty(db: DB) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM companies").get() as {
    n: number;
  };
  if (row.n > 0) return;

  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO companies (id, name, invoice_number_prefix, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insert.run("intersumma", "Intersumma", "INT-", now, now);
    insert.run("maelilly", "Maelilly", "MAE-", now, now);
  });
  tx();
  log.info({ scope: "accounting/db" }, "seeded default companies");
}
