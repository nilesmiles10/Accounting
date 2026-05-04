import { getDb } from "@/lib/db";

/**
 * Generic key/value settings store. Value is JSON-encoded so any shape works.
 */
export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb()
    .prepare("SELECT value_json FROM settings WHERE key = ?")
    .get(key) as { value_json: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function setSetting<T>(key: string, value: T): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), now);
}

// ─── Typed accessors ───────────────────────────────────────────────────────

export interface EmailSettings {
  postmark_server_token: string;
  test_mode: boolean;
}

const EMAIL_KEY = "email";

export function getEmailSettings(): EmailSettings {
  return getSetting<EmailSettings>(EMAIL_KEY, {
    postmark_server_token: "",
    test_mode: false,
  });
}

export function setEmailSettings(next: EmailSettings): void {
  setSetting(EMAIL_KEY, next);
}
