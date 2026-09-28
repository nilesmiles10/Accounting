/**
 * Test-helpers voor een verse boekhoud-db per testfile.
 * DATA_DIR wordt gezet in setup.ts; hier alleen seeden + opschonen.
 */
import { getDb } from "@/lib/db";
import { ensureDefaultChartSeeded } from "@/lib/ledger/accounts";
import { createClient } from "@/lib/clients";

export function initTestDb() {
  const db = getDb();
  // db.ts zaait het rekeningschema via require(); dat faalt stil onder
  // vitest (ESM), dus expliciet aanroepen. Idempotent.
  ensureDefaultChartSeeded();
  return db;
}

/** Wist alle mutaties zodat elke test vanaf een lege administratie start. */
export function resetLedger() {
  const db = getDb();
  db.exec(`
    DELETE FROM journal_lines;
    DELETE FROM journal_entries;
    DELETE FROM accounting_periods;
    DELETE FROM vat_submissions;
  `);
}

export function makeClient(name = "Testklant BV") {
  return createClient({ name });
}
