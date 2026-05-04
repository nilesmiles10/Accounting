import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCompany } from "@/lib/companies";
import { getClient } from "@/lib/clients";
import {
  calculateTotals,
  calculateLine,
  type LineInput,
  type VatTreatment,
  type InvoiceLanguage,
  addDaysISO,
  todayISO,
  createDraft as createInvoiceDraft,
  type InvoiceWithLines,
} from "@/lib/invoices";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "converted";

export interface Quote {
  id: string;
  company_id: string;
  client_id: string;
  number: string;
  status: QuoteStatus;
  language: InvoiceLanguage;
  currency: string;
  issue_date: string;
  valid_until_date: string;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  vat_treatment: VatTreatment;
  reference: string | null;
  notes: string | null;
  terms_text: string | null;
  signature_line: string | null;
  sent_at: number | null;
  accepted_at: number | null;
  rejected_at: number | null;
  expired_at: number | null;
  emailed_at: number | null;
  postmark_message_id: string | null;
  company_snapshot_json: string | null;
  client_snapshot_json: string | null;
  converted_invoice_id: string | null;
  public_token: string | null;
  accepted_by_name: string | null;
  accepted_by_ip: string | null;
  rejected_by_name: string | null;
  rejected_by_ip: string | null;
  rejected_reason: string | null;
  reminder_sent_at: number | null;
  expiry_warning_sent_at: number | null;
  open_count: number;
  last_opened_at: number | null;
  link_click_count: number;
  last_clicked_at: number | null;
  auto_invoice_on_accept: number;
  created_at: number;
  updated_at: number;
}

export interface QuoteLine {
  id: string;
  quote_id: string;
  sort_order: number;
  description: string;
  quantity_milli: number;
  unit: string | null;
  unit_price_cents: number;
  vat_rate: number;
  line_total_cents: number;
  line_vat_cents: number;
}

export interface QuoteWithLines extends Quote {
  lines: QuoteLine[];
}

export interface QuoteListItem extends Quote {
  company_name: string;
  client_name: string;
}

export interface QuoteDraftInput {
  company_id: string;
  client_id: string;
  language?: InvoiceLanguage;
  issue_date?: string;
  valid_until_date?: string;
  vat_treatment?: VatTreatment;
  reference?: string | null;
  notes?: string | null;
  terms_text?: string | null;
  signature_line?: string | null;
  auto_invoice_on_accept?: number;
  lines?: LineInput[];
}

export type QuoteUpdateInput = Partial<QuoteDraftInput> & {
  lines?: LineInput[];
};

// ─── Queries ───────────────────────────────────────────────────────────────

export function listQuotes(filter?: {
  status?: QuoteStatus | "open";
  company_id?: string;
  client_id?: string;
}): QuoteListItem[] {
  const db = getDb();
  const where: string[] = ["q.tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (filter?.status === "open") {
    where.push("q.status = 'sent'");
  } else if (filter?.status) {
    where.push("q.status = ?");
    values.push(filter.status);
  }
  if (filter?.company_id) {
    where.push("q.company_id = ?");
    values.push(filter.company_id);
  }
  if (filter?.client_id) {
    where.push("q.client_id = ?");
    values.push(filter.client_id);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  return db
    .prepare(
      `SELECT q.*, c.name AS company_name, cl.name AS client_name
       FROM quotes q
       JOIN companies c ON c.id = q.company_id
       JOIN clients cl ON cl.id = q.client_id
       ${whereSql}
       ORDER BY q.issue_date DESC, q.created_at DESC`,
    )
    .all(...values) as QuoteListItem[];
}

export function getQuoteWithLines(id: string): QuoteWithLines | null {
  const db = getDb();
  const quote = db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(id) as Quote | undefined;
  if (!quote) return null;
  const lines = db
    .prepare(
      "SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id",
    )
    .all(id) as QuoteLine[];
  return { ...quote, lines };
}

export function getQuoteRenderContext(quote: Quote): {
  company: import("./companies").Company;
  client: import("./clients").Client;
  source: "live" | "snapshot";
} {
  if (
    quote.status !== "draft" &&
    quote.company_snapshot_json &&
    quote.client_snapshot_json
  ) {
    return {
      company: JSON.parse(
        quote.company_snapshot_json,
      ) as import("./companies").Company,
      client: JSON.parse(
        quote.client_snapshot_json,
      ) as import("./clients").Client,
      source: "snapshot",
    };
  }
  const company = getCompany(quote.company_id);
  if (!company) throw new Error("Bedrijf bestaat niet");
  const client = getClient(quote.client_id);
  if (!client) throw new Error("Klant bestaat niet");
  return { company, client, source: "live" };
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export function createQuoteDraft(input: QuoteDraftInput): QuoteWithLines {
  const company = getCompany(input.company_id);
  if (!company) throw new Error("Bedrijf bestaat niet");
  const client = getClient(input.client_id);
  if (!client) throw new Error("Klant bestaat niet");

  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const language = input.language || company.default_language;
  const issue = input.issue_date || todayISO();
  const valid =
    input.valid_until_date ||
    addDaysISO(issue, company.default_quote_validity_days || 30);
  const treatment = input.vat_treatment || suggestTreatment(company, client);
  const lines = input.lines || [];
  const totals = calculateTotals(lines, treatment);
  const draftNumber = `DRAFT-${id.slice(0, 8)}`;

  const signatureDefault =
    language === "en"
      ? company.quote_signature_line_en
      : company.quote_signature_line_nl;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO quotes (
         id, tenant_id, company_id, client_id, number, status, language, currency,
         issue_date, valid_until_date, subtotal_cents, vat_total_cents,
         total_cents, vat_treatment, reference, notes, terms_text,
         signature_line, auto_invoice_on_accept, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'draft', ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      getCurrentTenantId(),
      input.company_id,
      input.client_id,
      draftNumber,
      language,
      issue,
      valid,
      totals.subtotal_cents,
      totals.vat_total_cents,
      totals.total_cents,
      treatment,
      input.reference ?? null,
      input.notes ?? null,
      input.terms_text ?? company.default_terms_text,
      input.signature_line ?? signatureDefault,
      input.auto_invoice_on_accept ? 1 : 0,
      now,
      now,
    );
    insertLines(id, lines, treatment);
    logEvent(id, "created", {
      company_id: input.company_id,
      client_id: input.client_id,
    });
  });
  tx();

  return getQuoteWithLines(id)!;
}

export function updateQuoteDraft(
  id: string,
  patch: QuoteUpdateInput,
): QuoteWithLines | null {
  const db = getDb();
  const current = getQuoteWithLines(id);
  if (!current) return null;
  if (current.status !== "draft") {
    throw new Error("Alleen concept-offertes zijn bewerkbaar");
  }

  if (patch.company_id && patch.company_id !== current.company_id) {
    if (!getCompany(patch.company_id)) throw new Error("Bedrijf bestaat niet");
  }
  if (patch.client_id && patch.client_id !== current.client_id) {
    if (!getClient(patch.client_id)) throw new Error("Klant bestaat niet");
  }

  const merged = {
    company_id: patch.company_id ?? current.company_id,
    client_id: patch.client_id ?? current.client_id,
    language: patch.language ?? current.language,
    issue_date: patch.issue_date ?? current.issue_date,
    valid_until_date: patch.valid_until_date ?? current.valid_until_date,
    vat_treatment: patch.vat_treatment ?? current.vat_treatment,
    reference: patch.reference ?? current.reference,
    notes: patch.notes ?? current.notes,
    terms_text: patch.terms_text ?? current.terms_text,
    signature_line: patch.signature_line ?? current.signature_line,
    auto_invoice_on_accept:
      patch.auto_invoice_on_accept ?? current.auto_invoice_on_accept,
  };
  const lines = patch.lines ?? toLineInputs(current.lines);
  const totals = calculateTotals(lines, merged.vat_treatment);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE quotes SET
         company_id = ?, client_id = ?, language = ?, issue_date = ?,
         valid_until_date = ?, vat_treatment = ?, reference = ?, notes = ?,
         terms_text = ?, signature_line = ?, auto_invoice_on_accept = ?,
         subtotal_cents = ?, vat_total_cents = ?, total_cents = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.company_id,
      merged.client_id,
      merged.language,
      merged.issue_date,
      merged.valid_until_date,
      merged.vat_treatment,
      merged.reference,
      merged.notes,
      merged.terms_text,
      merged.signature_line,
      merged.auto_invoice_on_accept,
      totals.subtotal_cents,
      totals.vat_total_cents,
      totals.total_cents,
      Date.now(),
      id,
    );
    if (patch.lines) {
      db.prepare("DELETE FROM quote_lines WHERE quote_id = ?").run(id);
      insertLines(id, patch.lines, merged.vat_treatment);
    }
    logEvent(id, "updated", null);
  });
  tx();
  return getQuoteWithLines(id);
}

export function deleteQuoteDraft(id: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM quotes WHERE id = ?")
    .get(id) as { status: string } | undefined;
  if (!row) return false;
  if (row.status !== "draft") {
    throw new Error("Alleen concepten kunnen worden verwijderd");
  }
  db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
  return true;
}

/**
 * Finaliseer = klaar om te versturen. Kent definitief nummer toe uit
 * company-reeks, snapshot bedrijfs/klantdata, status → 'sent'.
 */
export function finalizeQuote(id: string): QuoteWithLines {
  const db = getDb();
  const current = getQuoteWithLines(id);
  if (!current) throw new Error("Offerte bestaat niet");
  if (current.status !== "draft") {
    throw new Error("Alleen concept-offertes kunnen worden gefinaliseerd");
  }
  if (current.lines.length === 0) {
    throw new Error("Offerte heeft geen regels");
  }

  const year = current.issue_date.slice(0, 4);

  const tx = db.transaction(() => {
    const companyRow = db
      .prepare("SELECT * FROM companies WHERE id = ?")
      .get(current.company_id);
    if (!companyRow) throw new Error("Bedrijf bestaat niet");
    const clientRow = db
      .prepare("SELECT * FROM clients WHERE id = ?")
      .get(current.client_id);
    if (!clientRow) throw new Error("Klant bestaat niet");

    const comp = companyRow as {
      quote_number_prefix: string;
      quote_number_next: number;
      quote_number_padding: number;
    };
    const seq = comp.quote_number_next;
    const padded = String(seq).padStart(comp.quote_number_padding, "0");
    const number = `${comp.quote_number_prefix}${year}-${padded}`;

    // Publiek accept-token: 32 bytes random, url-safe. Onraadbaar (entropy
    // >= 256 bits), één-per-offerte en wordt pas gegenereerd bij finalize
    // zodat drafts geen linkable state hebben.
    const token = crypto.randomBytes(32).toString("base64url");

    db.prepare(
      "UPDATE companies SET quote_number_next = quote_number_next + 1, updated_at = ? WHERE id = ?",
    ).run(Date.now(), current.company_id);

    db.prepare(
      `UPDATE quotes SET
         number = ?, status = 'sent', sent_at = ?, updated_at = ?,
         company_snapshot_json = ?, client_snapshot_json = ?,
         public_token = ?
       WHERE id = ?`,
    ).run(
      number,
      Date.now(),
      Date.now(),
      JSON.stringify(companyRow),
      JSON.stringify(clientRow),
      token,
      id,
    );

    logEvent(id, "sent", { number, sequence: seq });
  });
  tx();
  return getQuoteWithLines(id)!;
}

/**
 * Backfill-helper: genereer een publieke token voor bestaande verzonden
 * offertes die er nog geen hebben (van vóór migratie 006).
 */
export function ensurePublicToken(id: string): string {
  const db = getDb();
  const row = db
    .prepare("SELECT status, public_token FROM quotes WHERE id = ?")
    .get(id) as { status: string; public_token: string | null } | undefined;
  if (!row) throw new Error("Offerte bestaat niet");
  if (row.public_token) return row.public_token;
  if (row.status === "draft") {
    throw new Error(
      "Concept kan geen publieke link krijgen — finaliseer eerst",
    );
  }
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "UPDATE quotes SET public_token = ?, updated_at = ? WHERE id = ?",
  ).run(token, Date.now(), id);
  logEvent(id, "public_token_generated", { backfill: true });
  return token;
}

export function getQuoteByPublicToken(token: string): QuoteWithLines | null {
  const db = getDb();
  const quote = db
    .prepare("SELECT * FROM quotes WHERE public_token = ?")
    .get(token) as Quote | undefined;
  if (!quote) return null;
  const lines = db
    .prepare(
      "SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order, id",
    )
    .all(quote.id) as QuoteLine[];
  return { ...quote, lines };
}

/** Helper voor de publieke accept-flow: haalt invoice public_token op
 *  (wordt al gezet bij finalize, maar robust tegen missing). */
export function ensureInvoicePublicTokenFromQuote(invoiceId: string): string {
  // Delegeert naar invoices.ensureInvoicePublicToken maar via dynamic
  // import om een circulaire dependency te vermijden.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./invoices") as typeof import("./invoices");
  return mod.ensureInvoicePublicToken(invoiceId);
}

export function acceptQuoteByToken(
  token: string,
  name: string,
  ip: string,
): QuoteWithLines {
  const db = getDb();
  const quote = getQuoteByPublicToken(token);
  if (!quote) throw new Error("Offerte bestaat niet");
  if (quote.status === "accepted") {
    // Idempotent: al geaccepteerd → gewoon huidige data teruggeven
    return quote;
  }
  if (quote.status !== "sent") {
    throw new Error("Deze offerte kan niet meer worden geaccepteerd");
  }
  const now = Date.now();
  db.prepare(
    `UPDATE quotes SET
       status = 'accepted', accepted_at = ?, updated_at = ?,
       accepted_by_name = ?, accepted_by_ip = ?
     WHERE id = ?`,
  ).run(now, now, name.trim(), ip, quote.id);
  logEvent(quote.id, "accepted_public", { name: name.trim(), ip });
  return getQuoteWithLines(quote.id)!;
}

export function rejectQuoteByToken(
  token: string,
  name: string,
  reason: string | null,
  ip: string,
): QuoteWithLines {
  const db = getDb();
  const quote = getQuoteByPublicToken(token);
  if (!quote) throw new Error("Offerte bestaat niet");
  if (quote.status === "rejected") return quote;
  if (quote.status !== "sent") {
    throw new Error("Deze offerte kan niet meer worden afgewezen");
  }
  const now = Date.now();
  db.prepare(
    `UPDATE quotes SET
       status = 'rejected', rejected_at = ?, updated_at = ?,
       rejected_by_name = ?, rejected_by_ip = ?, rejected_reason = ?
     WHERE id = ?`,
  ).run(
    now,
    now,
    name.trim(),
    ip,
    reason ? reason.trim() : null,
    quote.id,
  );
  logEvent(quote.id, "rejected_public", {
    name: name.trim(),
    ip,
    reason: reason || null,
  });
  return getQuoteWithLines(quote.id)!;
}

export function acceptQuote(id: string): QuoteWithLines | null {
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM quotes WHERE id = ?")
    .get(id) as { status: string } | undefined;
  if (!row) return null;
  if (row.status !== "sent") {
    throw new Error("Alleen verstuurde offertes kunnen worden geaccepteerd");
  }
  const now = Date.now();
  db.prepare(
    "UPDATE quotes SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?",
  ).run(now, now, id);
  logEvent(id, "accepted", null);
  return getQuoteWithLines(id);
}

export function rejectQuote(id: string): QuoteWithLines | null {
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM quotes WHERE id = ?")
    .get(id) as { status: string } | undefined;
  if (!row) return null;
  if (row.status !== "sent") {
    throw new Error("Alleen verstuurde offertes kunnen worden afgewezen");
  }
  const now = Date.now();
  db.prepare(
    "UPDATE quotes SET status = 'rejected', rejected_at = ?, updated_at = ? WHERE id = ?",
  ).run(now, now, id);
  logEvent(id, "rejected", null);
  return getQuoteWithLines(id);
}

/**
 * Opportunistische expire-detectie: offertes met status 'sent' en
 * valid_until_date < today worden 'expired'. Aangeroepen op dashboard.
 */
export function markExpiredQuotes(): number {
  const db = getDb();
  const today = todayISO();
  const res = db
    .prepare(
      `UPDATE quotes SET status = 'expired', expired_at = ?, updated_at = ?
       WHERE status = 'sent' AND valid_until_date < ?`,
    )
    .run(Date.now(), Date.now(), today);
  return res.changes || 0;
}

/**
 * Converteer geaccepteerde offerte naar een concept-factuur. Gebruikt
 * createInvoiceDraft — factuur is daarna vrij bewerkbaar tot finaliseren.
 */
export function convertQuoteToInvoice(id: string): InvoiceWithLines {
  const db = getDb();
  const quote = getQuoteWithLines(id);
  if (!quote) throw new Error("Offerte bestaat niet");
  if (quote.status !== "accepted") {
    throw new Error(
      "Alleen geaccepteerde offertes kunnen geconverteerd worden",
    );
  }
  if (quote.converted_invoice_id) {
    throw new Error("Deze offerte is al omgezet naar factuur");
  }

  const invoice = createInvoiceDraft({
    company_id: quote.company_id,
    client_id: quote.client_id,
    language: quote.language,
    vat_treatment: quote.vat_treatment,
    reference: quote.number,
    notes: quote.notes,
    terms_text: quote.terms_text,
    lines: quote.lines.map((l) => ({
      description: l.description,
      quantity_milli: l.quantity_milli,
      unit: l.unit,
      unit_price_cents: l.unit_price_cents,
      vat_rate: l.vat_rate,
    })),
  });

  db.prepare(
    "UPDATE quotes SET status = 'converted', converted_invoice_id = ?, updated_at = ? WHERE id = ?",
  ).run(invoice.id, Date.now(), id);
  logEvent(id, "converted", { invoice_id: invoice.id });

  return invoice;
}

// ─── Internals ─────────────────────────────────────────────────────────────

function insertLines(
  quoteId: string,
  lines: LineInput[],
  treatment: VatTreatment,
) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO quote_lines
       (id, quote_id, sort_order, description, quantity_milli, unit,
        unit_price_cents, vat_rate, line_total_cents, line_vat_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((line, idx) => {
    const calc = calculateLine(line, treatment);
    insert.run(
      crypto.randomUUID(),
      quoteId,
      idx,
      line.description,
      line.quantity_milli,
      line.unit ?? "stuk",
      line.unit_price_cents,
      line.vat_rate,
      calc.line_total_cents,
      calc.line_vat_cents,
    );
  });
}

function toLineInputs(lines: QuoteLine[]): LineInput[] {
  return lines.map((l) => ({
    description: l.description,
    quantity_milli: l.quantity_milli,
    unit: l.unit,
    unit_price_cents: l.unit_price_cents,
    vat_rate: l.vat_rate,
  }));
}

function logEvent(quoteId: string, type: string, payload: unknown) {
  const db = getDb();
  db.prepare(
    `INSERT INTO quote_events (id, quote_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    quoteId,
    type,
    payload === null || payload === undefined ? null : JSON.stringify(payload),
    Date.now(),
  );
}

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK",
]);

function suggestTreatment(
  company: { country: string | null },
  client: { country: string | null; vat_number: string | null },
): VatTreatment {
  const from = (company.country || "NL").toUpperCase();
  const to = (client.country || "NL").toUpperCase();
  if (from === to) return "standard";
  if (EU_COUNTRIES.has(to) && client.vat_number) return "reverse_charge_eu";
  if (!EU_COUNTRIES.has(to)) return "export_outside_eu";
  return "standard";
}
