#!/usr/bin/env node
/**
 * SQLite online-backup runner. Draait binnen de nova-accounting container
 * (via `docker exec`) omdat better-sqlite3 daar al geïnstalleerd staat en
 * dezelfde SQLite-binding gebruikt als de app zelf.
 *
 * Gebruikt SQLite's Online Backup API (via better-sqlite3 `.backup()`):
 * atomair, WAL-aware, blokkeert writers niet. Veiliger dan `cp` van de
 * .db file omdat WAL kan bestaan als ongesynchroniseerde transacties.
 *
 * Output landt in /app/.data/backups/ (op dezelfde volume als de DB),
 * zodat de host er via /var/lib/docker/volumes/... bij kan zonder
 * docker cp.
 *
 * Retentie in de container: 7 dagen recent (kleine buffer voordat host
 * ze ophaalt); host-script doet 30d + 12m retentie.
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const SRC = "/app/.data/accounting/accounting.db";
const BACKUP_DIR = "/app/.data/backups";
const LOCAL_RETENTION_DAYS = 7;

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function run() {
  if (!fs.existsSync(SRC)) {
    console.error(`FATAL: source db not found: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = nowStamp();
  const dest = path.join(BACKUP_DIR, `accounting-${stamp}.db`);

  const db = new Database(SRC, { readonly: true, fileMustExist: true });
  try {
    // Online backup — copyt page-by-page, safe onder concurrent writes.
    // Returnt Promise die resolvet zodra klaar. Progress is niet nodig
    // voor onze DB-grootte (~10-50 MB max).
    await db.backup(dest);
  } finally {
    db.close();
  }

  // Integriteitscheck op de backup zelf — voorkomt dat we een corrupte
  // backup als "goed" markeren.
  const check = new Database(dest, { readonly: true });
  try {
    const r = check.pragma("integrity_check", { simple: true });
    if (r !== "ok") {
      throw new Error(`backup integrity_check faalde: ${r}`);
    }
  } finally {
    check.close();
  }

  // Retentie in container — verwijder backups ouder dan N dagen. Host
  // moet ze uiteraard al opgehaald hebben.
  const cutoff = Date.now() - LOCAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.startsWith("accounting-") || !f.endsWith(".db")) continue;
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      console.log(`pruned old backup: ${f}`);
    }
  }

  const size = fs.statSync(dest).size;
  console.log(
    JSON.stringify({
      ok: true,
      path: dest,
      size_bytes: size,
      size_mb: +(size / 1024 / 1024).toFixed(2),
      stamp,
    }),
  );
}

run().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
