import { getDb } from "@/lib/db";

export interface MailLogEntry {
  id: string;
  created_at: number;
  source_type: "invoice" | "quote";
  source_id: string;
  source_number: string | null;
  source_company_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  event_type: string;
  message_id: string | null;
  payload: Record<string, unknown>;
}

export interface MailLogFilter {
  source_type?: "invoice" | "quote";
  event_types?: string[];
  from?: string; // ISO yyyy-mm-dd
  to?: string;
  limit?: number;
}

/**
 * Mail-log: combineert invoice_events + quote_events met email-gerelateerde
 * types tot één chronologische stream. Gebruikt voor de
 * /mail-log pagina zodat user kan zien:
 *   - welke factuur/offerte e-mail is verstuurd, naar wie, wanneer
 *   - welke herinneringen zijn geactiveerd
 *   - bounces / spam-meldingen van Postmark webhook
 *   - opens / clicks (waar getrackt)
 *
 * NB: we tonen alleen events die met e-mail te maken hebben - 'created',
 * 'updated', 'journalised' etc filteren we eruit zodat de log puur over
 * communicatie gaat.
 */
const EMAIL_EVENT_TYPES = [
  "emailed",
  "sent_email",
  "reminder_sent",
  "expiry_reminder_sent",
  "bounced",
  "spam_complaint",
  "reminders_paused",
  "reminders_resumed",
] as const;

export function listMailLog(filter: MailLogFilter = {}): MailLogEntry[] {
  const db = getDb();
  const limit = Math.min(filter.limit ?? 200, 1000);
  const types = filter.event_types?.length
    ? filter.event_types
    : (EMAIL_EVENT_TYPES as readonly string[]);

  const placeholders = types.map(() => "?").join(",");
  const params: unknown[] = [];

  const conditions: string[] = [];
  conditions.push(`ie.type IN (${placeholders})`);
  params.push(...types);
  if (filter.from) {
    conditions.push(`ie.created_at >= ?`);
    params.push(new Date(filter.from + "T00:00:00Z").getTime());
  }
  if (filter.to) {
    conditions.push(`ie.created_at <= ?`);
    params.push(new Date(filter.to + "T23:59:59Z").getTime());
  }
  const where = conditions.join(" AND ");

  const includeInvoice =
    !filter.source_type || filter.source_type === "invoice";
  const includeQuote = !filter.source_type || filter.source_type === "quote";

  const queries: string[] = [];

  if (includeInvoice) {
    queries.push(
      `SELECT
         ie.id, ie.created_at, ie.type AS event_type, ie.payload_json,
         'invoice' AS source_type, i.id AS source_id, i.number AS source_number,
         i.company_id AS source_company_id,
         c.name AS recipient_name, c.email AS recipient_email
       FROM invoice_events ie
       JOIN invoices i ON i.id = ie.invoice_id
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE ${where}`,
    );
  }
  if (includeQuote) {
    queries.push(
      `SELECT
         qe.id, qe.created_at, qe.type AS event_type, qe.payload_json,
         'quote' AS source_type, q.id AS source_id, q.number AS source_number,
         q.company_id AS source_company_id,
         c.name AS recipient_name, c.email AS recipient_email
       FROM quote_events qe
       JOIN quotes q ON q.id = qe.quote_id
       LEFT JOIN clients c ON c.id = q.client_id
       WHERE ${where}`,
    );
  }

  if (queries.length === 0) return [];
  const sql = `${queries.join(" UNION ALL ")}
               ORDER BY created_at DESC
               LIMIT ?`;
  // Each branch needs its own copy of params
  const allParams =
    queries.length === 2 ? [...params, ...params, limit] : [...params, limit];

  const rows = db.prepare(sql).all(...allParams) as Array<{
    id: string;
    created_at: number;
    event_type: string;
    payload_json: string | null;
    source_type: "invoice" | "quote";
    source_id: string;
    source_number: string | null;
    source_company_id: string | null;
    recipient_name: string | null;
    recipient_email: string | null;
  }>;

  return rows.map((r) => {
    let payload: Record<string, unknown> = {};
    if (r.payload_json) {
      try {
        payload = JSON.parse(r.payload_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    return {
      id: r.id,
      created_at: r.created_at,
      source_type: r.source_type,
      source_id: r.source_id,
      source_number: r.source_number,
      source_company_id: r.source_company_id,
      recipient_name: r.recipient_name,
      recipient_email: r.recipient_email,
      event_type: r.event_type,
      message_id:
        (payload.message_id as string | undefined) ?? null,
      payload,
    };
  });
}
