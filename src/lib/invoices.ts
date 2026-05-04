import crypto from "crypto";
import { getCurrentTenantId } from "@/lib/tenant";
import { getDb } from "@/lib/db";
import { getCompany } from "@/lib/companies";
import { getClient } from "@/lib/clients";
import {
  postInvoiceFinalized,
  postInvoicePaid,
} from "@/lib/ledger/auto-post";
import { reverseEntry } from "@/lib/ledger/journal";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export type VatTreatment =
  | "standard"
  | "reverse_charge_eu"
  | "export_outside_eu";

export type InvoiceLanguage = "nl" | "en";

export interface Invoice {
  id: string;
  company_id: string;
  client_id: string;
  number: string;
  status: InvoiceStatus;
  language: InvoiceLanguage;
  currency: string;
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  vat_treatment: VatTreatment;
  reference: string | null;
  notes: string | null;
  terms_text: string | null;
  pdf_path: string | null;
  sent_at: number | null;
  paid_at: number | null;
  cancelled_at: number | null;
  postmark_message_id: string | null;
  company_snapshot_json: string | null;
  client_snapshot_json: string | null;
  open_count: number;
  last_opened_at: number | null;
  link_click_count: number;
  last_clicked_at: number | null;
  mollie_payment_id: string | null;
  mollie_payment_url: string | null;
  mollie_status: string | null;
  mollie_paid_at: number | null;
  public_token: string | null;
  reminder_count: number;
  last_reminder_at: number | null;
  is_credit_note: number;
  credits_invoice_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  sort_order: number;
  description: string;
  /** quantity × 1000; allow 3 decimals */
  quantity_milli: number;
  unit: string | null;
  unit_price_cents: number;
  vat_rate: number;
  line_total_cents: number;
  line_vat_cents: number;
}

export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[];
}

export interface InvoiceListItem extends Invoice {
  company_name: string;
  client_name: string;
}

export interface LineInput {
  description: string;
  quantity_milli: number;
  unit?: string | null;
  unit_price_cents: number;
  vat_rate: number;
}

export interface InvoiceDraftInput {
  company_id: string;
  client_id: string;
  language?: InvoiceLanguage;
  issue_date?: string;
  due_date?: string;
  vat_treatment?: VatTreatment;
  reference?: string | null;
  notes?: string | null;
  terms_text?: string | null;
  lines?: LineInput[];
}

export interface InvoiceUpdateInput extends Partial<InvoiceDraftInput> {
  lines?: LineInput[];
}

// ─── Calculation ───────────────────────────────────────────────────────────

/**
 * Per-line totals are calculated from qty × unit_price, then VAT on top.
 * All monetary math in integer cents; Math.round breaks ties away from zero.
 * VAT rate is forced to 0 when the invoice has reverse_charge_eu or
 * export_outside_eu treatment — the line may still carry a rate in the editor
 * but the computed line_vat_cents will be zero.
 */
export function calculateLine(
  line: LineInput,
  treatment: VatTreatment,
): { line_total_cents: number; line_vat_cents: number } {
  const subtotal = Math.round(
    (line.quantity_milli * line.unit_price_cents) / 1000,
  );
  const effectiveRate = treatment === "standard" ? line.vat_rate : 0;
  const vat = Math.round((subtotal * effectiveRate) / 100);
  return { line_total_cents: subtotal, line_vat_cents: vat };
}

export function calculateTotals(
  lines: LineInput[],
  treatment: VatTreatment,
): {
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
} {
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    const calc = calculateLine(l, treatment);
    subtotal += calc.line_total_cents;
    vat += calc.line_vat_cents;
  }
  return {
    subtotal_cents: subtotal,
    vat_total_cents: vat,
    total_cents: subtotal + vat,
  };
}

export function vatBreakdown(
  lines: InvoiceLine[],
  treatment: VatTreatment,
): { rate: number; base_cents: number; vat_cents: number }[] {
  const effective = treatment === "standard";
  const map = new Map<
    number,
    { rate: number; base_cents: number; vat_cents: number }
  >();
  for (const l of lines) {
    const rate = effective ? l.vat_rate : 0;
    const entry = map.get(rate) ?? {
      rate,
      base_cents: 0,
      vat_cents: 0,
    };
    entry.base_cents += l.line_total_cents;
    entry.vat_cents += effective ? l.line_vat_cents : 0;
    map.set(rate, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

// ─── Date helpers ──────────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Queries ───────────────────────────────────────────────────────────────

export function listInvoices(filter?: {
  status?: InvoiceStatus | "open";
  company_id?: string;
  client_id?: string;
}): InvoiceListItem[] {
  const db = getDb();
  const where: string[] = ["i.tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (filter?.status === "open") {
    where.push("i.status IN ('sent','overdue')");
  } else if (filter?.status) {
    where.push("i.status = ?");
    values.push(filter.status);
  }
  if (filter?.company_id) {
    where.push("i.company_id = ?");
    values.push(filter.company_id);
  }
  if (filter?.client_id) {
    where.push("i.client_id = ?");
    values.push(filter.client_id);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  return db
    .prepare(
      `SELECT i.*, c.name AS company_name, cl.name AS client_name
       FROM invoices i
       JOIN companies c ON c.id = i.company_id
       JOIN clients cl ON cl.id = i.client_id
       ${whereSql}
       ORDER BY i.issue_date DESC, i.created_at DESC`,
    )
    .all(...values) as InvoiceListItem[];
}

export function getInvoiceWithLines(id: string): InvoiceWithLines | null {
  const db = getDb();
  const invoice = db
    .prepare("SELECT * FROM invoices WHERE id = ?")
    .get(id) as Invoice | undefined;
  if (!invoice) return null;
  const lines = db
    .prepare(
      "SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order, id",
    )
    .all(id) as InvoiceLine[];
  return { ...invoice, lines };
}

/**
 * Returns company + client to use for rendering this invoice.
 * - draft: always live (edits flow through)
 * - finalized with snapshot: frozen snapshot (audit-safe)
 * - finalized without snapshot (legacy, pre-migration 004): live fallback
 */
export function getRenderContext(invoice: Invoice): {
  company: import("./companies").Company;
  client: import("./clients").Client;
  source: "live" | "snapshot";
} {
  if (
    invoice.status !== "draft" &&
    invoice.company_snapshot_json &&
    invoice.client_snapshot_json
  ) {
    return {
      company: JSON.parse(
        invoice.company_snapshot_json,
      ) as import("./companies").Company,
      client: JSON.parse(
        invoice.client_snapshot_json,
      ) as import("./clients").Client,
      source: "snapshot",
    };
  }
  const company = getCompany(invoice.company_id);
  if (!company) throw new Error("Bedrijf bestaat niet");
  const client = getClient(invoice.client_id);
  if (!client) throw new Error("Klant bestaat niet");
  return { company, client, source: "live" };
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export function createDraft(input: InvoiceDraftInput): InvoiceWithLines {
  const company = getCompany(input.company_id);
  if (!company) throw new Error("Bedrijf bestaat niet");
  const client = getClient(input.client_id);
  if (!client) throw new Error("Klant bestaat niet");

  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const language = input.language || company.default_language;
  const issue = input.issue_date || todayISO();
  const due =
    input.due_date ||
    addDaysISO(issue, company.default_payment_terms_days);
  const treatment = input.vat_treatment || suggestTreatment(company, client);
  const lines = input.lines || [];
  const totals = calculateTotals(lines, treatment);

  // Temporary placeholder number for drafts — replaced on finalize. Using the
  // id suffix keeps it unique against the (company_id, number) UNIQUE index
  // if the user creates multiple drafts on the same company.
  const draftNumber = `DRAFT-${id.slice(0, 8)}`;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO invoices (
         id, tenant_id, company_id, client_id, number, status, language, currency,
         issue_date, due_date, subtotal_cents, vat_total_cents, total_cents,
         vat_treatment, reference, notes, terms_text,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'draft', ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      getCurrentTenantId(),
      input.company_id,
      input.client_id,
      draftNumber,
      language,
      issue,
      due,
      totals.subtotal_cents,
      totals.vat_total_cents,
      totals.total_cents,
      treatment,
      input.reference ?? null,
      input.notes ?? null,
      input.terms_text ?? company.default_terms_text,
      now,
      now,
    );
    insertLines(id, lines, treatment);
    logEvent(id, "created", { company_id: input.company_id, client_id: input.client_id });
  });
  tx();

  return getInvoiceWithLines(id)!;
}

export function updateDraft(
  id: string,
  patch: InvoiceUpdateInput,
): InvoiceWithLines | null {
  const db = getDb();
  const current = getInvoiceWithLines(id);
  if (!current) return null;
  if (current.status !== "draft") {
    throw new Error("Alleen concept-facturen zijn bewerkbaar");
  }

  // If company_id / client_id change, validate
  if (patch.company_id && patch.company_id !== current.company_id) {
    if (!getCompany(patch.company_id))
      throw new Error("Bedrijf bestaat niet");
  }
  if (patch.client_id && patch.client_id !== current.client_id) {
    if (!getClient(patch.client_id)) throw new Error("Klant bestaat niet");
  }

  const merged = {
    company_id: patch.company_id ?? current.company_id,
    client_id: patch.client_id ?? current.client_id,
    language: patch.language ?? current.language,
    issue_date: patch.issue_date ?? current.issue_date,
    due_date: patch.due_date ?? current.due_date,
    vat_treatment: patch.vat_treatment ?? current.vat_treatment,
    reference: patch.reference ?? current.reference,
    notes: patch.notes ?? current.notes,
    terms_text: patch.terms_text ?? current.terms_text,
  };
  const lines = patch.lines ?? toLineInputs(current.lines);
  const totals = calculateTotals(lines, merged.vat_treatment);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE invoices SET
         company_id = ?, client_id = ?, language = ?, issue_date = ?,
         due_date = ?, vat_treatment = ?, reference = ?, notes = ?,
         terms_text = ?, subtotal_cents = ?, vat_total_cents = ?,
         total_cents = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.company_id,
      merged.client_id,
      merged.language,
      merged.issue_date,
      merged.due_date,
      merged.vat_treatment,
      merged.reference,
      merged.notes,
      merged.terms_text,
      totals.subtotal_cents,
      totals.vat_total_cents,
      totals.total_cents,
      Date.now(),
      id,
    );
    if (patch.lines) {
      db.prepare("DELETE FROM invoice_lines WHERE invoice_id = ?").run(id);
      insertLines(id, patch.lines, merged.vat_treatment);
    }
    logEvent(id, "updated", null);
  });
  tx();
  return getInvoiceWithLines(id);
}

export function deleteDraft(id: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM invoices WHERE id = ?")
    .get(id) as { status: string } | undefined;
  if (!row) return false;
  if (row.status !== "draft") {
    throw new Error("Alleen concepten kunnen worden verwijderd");
  }
  db.prepare("DELETE FROM invoices WHERE id = ?").run(id);
  return true;
}

/**
 * Atomically assign the next number from the company sequence and mark the
 * invoice as "sent". Number format: {prefix}{year}-{padded-seq}.
 */
export function finalizeInvoice(id: string): InvoiceWithLines {
  const db = getDb();
  const current = getInvoiceWithLines(id);
  if (!current) throw new Error("Factuur bestaat niet");
  if (current.status !== "draft") {
    throw new Error("Alleen concept-facturen kunnen worden gefinaliseerd");
  }
  if (current.lines.length === 0) {
    throw new Error("Factuur heeft geen regels");
  }

  const year = current.issue_date.slice(0, 4);

  const tx = db.transaction(() => {
    // Snapshot full company + client rows now so later edits don't mutate
    // the rendered PDF. Entire row is captured as JSON — forward-compat.
    const companyRow = db
      .prepare("SELECT * FROM companies WHERE id = ?")
      .get(current.company_id);
    if (!companyRow) throw new Error("Bedrijf bestaat niet");
    const clientRow = db
      .prepare("SELECT * FROM clients WHERE id = ?")
      .get(current.client_id);
    if (!clientRow) throw new Error("Klant bestaat niet");

    const comp = companyRow as {
      invoice_number_prefix: string;
      invoice_number_next: number;
      invoice_number_padding: number;
    };
    const seq = comp.invoice_number_next;
    const padded = String(seq).padStart(comp.invoice_number_padding, "0");
    const number = `${comp.invoice_number_prefix}${year}-${padded}`;

    db.prepare(
      "UPDATE companies SET invoice_number_next = invoice_number_next + 1, updated_at = ? WHERE id = ?",
    ).run(Date.now(), current.company_id);

    // Publiek view-token — 32 bytes random, onraadbaar. Parity met offertes.
    const token = crypto.randomBytes(32).toString("base64url");

    db.prepare(
      `UPDATE invoices SET
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
  // Auto-journalisatie buiten de tx omdat post() z'n eigen tx draait.
  const journalId = postInvoiceFinalized(id);
  if (journalId) {
    db.prepare("UPDATE invoices SET updated_at = ? WHERE id = ?").run(
      Date.now(),
      id,
    );
    logEvent(id, "journalised", { journal_entry_id: journalId });
  }
  return getInvoiceWithLines(id)!;
}

/**
 * Genereer publieke view-token voor bestaande gefinaliseerde factuur
 * zonder token (backfill voor pre-migratie-009 facturen).
 */
export function ensureInvoicePublicToken(id: string): string {
  const db = getDb();
  const row = db
    .prepare("SELECT status, public_token FROM invoices WHERE id = ?")
    .get(id) as { status: string; public_token: string | null } | undefined;
  if (!row) throw new Error("Factuur bestaat niet");
  if (row.public_token) return row.public_token;
  if (row.status === "draft") {
    throw new Error(
      "Concept kan geen publieke link krijgen — finaliseer eerst",
    );
  }
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "UPDATE invoices SET public_token = ?, updated_at = ? WHERE id = ?",
  ).run(token, Date.now(), id);
  logEvent(id, "public_token_generated", { backfill: true });
  return token;
}

export function getInvoiceByPublicToken(
  token: string,
): InvoiceWithLines | null {
  const db = getDb();
  const invoice = db
    .prepare("SELECT * FROM invoices WHERE public_token = ?")
    .get(token) as Invoice | undefined;
  if (!invoice) return null;
  const lines = db
    .prepare(
      "SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order, id",
    )
    .all(invoice.id) as InvoiceLine[];
  return { ...invoice, lines };
}

export function markPaid(id: string): InvoiceWithLines | null {
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM invoices WHERE id = ?")
    .get(id) as { status: string } | undefined;
  if (!row) return null;
  if (row.status === "draft") {
    throw new Error("Concept kan niet op betaald gezet worden — finaliseer eerst");
  }
  if (row.status === "cancelled") {
    throw new Error("Geannuleerde factuur kan niet betaald worden");
  }
  const now = Date.now();
  db.prepare(
    "UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?",
  ).run(now, now, id);
  logEvent(id, "paid", null);
  // Auto-journalisatie: bank ↔ debiteuren
  const journalId = postInvoicePaid(id);
  if (journalId) {
    logEvent(id, "journalised_payment", { journal_entry_id: journalId });
  }
  return getInvoiceWithLines(id);
}

/**
 * Flip status=sent → overdue for invoices whose due_date has passed.
 * Idempotent: running it multiple times has no additional effect. Returns
 * the number of rows changed so the caller can log.
 *
 * Called opportunistically from the dashboard/invoices pages so we don't
 * need a separate cron. The cost is one cheap UPDATE per page visit.
 */
export function markOverdueInvoices(): number {
  const db = getDb();
  const today = todayISO();
  const res = db
    .prepare(
      `UPDATE invoices SET status = 'overdue', updated_at = ?
       WHERE status = 'sent' AND due_date < ?`,
    )
    .run(Date.now(), today);
  return res.changes || 0;
}

export function duplicateInvoice(id: string): InvoiceWithLines {
  const source = getInvoiceWithLines(id);
  if (!source) throw new Error("Factuur bestaat niet");

  return createDraft({
    company_id: source.company_id,
    client_id: source.client_id,
    language: source.language,
    vat_treatment: source.vat_treatment,
    reference: source.reference,
    notes: source.notes,
    terms_text: source.terms_text,
    lines: source.lines.map((l) => ({
      description: l.description,
      quantity_milli: l.quantity_milli,
      unit: l.unit,
      unit_price_cents: l.unit_price_cents,
      vat_rate: l.vat_rate,
    })),
  });
}

/**
 * Maak creditnota op basis van bestaande factuur. Dit is een nieuwe
 * draft-factuur met `is_credit_note = 1` en verwijzing naar het origineel
 * via `credits_invoice_id`. Lijnen worden gekloond met POSITIEVE bedragen
 * (DB-constraints staan geen negatieve toe); de auto-journalisatie en
 * BTW-rapportage detecteren is_credit_note en draaien debet/credit om.
 *
 * Boekhoudkundig: een creditnota corrigeert een verkoopfactuur richting
 * de klant. Eigen nummer in dezelfde serie (geen gat), eigen PDF met
 * "Creditnota"-heading.
 */
export function createCreditNoteFromInvoice(
  originalId: string,
): InvoiceWithLines {
  const source = getInvoiceWithLines(originalId);
  if (!source) throw new Error("Originele factuur bestaat niet");
  if (source.is_credit_note === 1) {
    throw new Error("Kan geen creditnota op een creditnota maken");
  }
  if (source.status === "draft") {
    throw new Error("Origineel is nog concept — finaliseer eerst");
  }

  const draft = createDraft({
    company_id: source.company_id,
    client_id: source.client_id,
    language: source.language,
    vat_treatment: source.vat_treatment,
    reference: `Creditnota voor ${source.number}`,
    notes:
      source.language === "en"
        ? `Credit note for invoice ${source.number}`
        : `Creditnota voor factuur ${source.number}`,
    terms_text: source.terms_text,
    lines: source.lines.map((l) => ({
      description: l.description,
      quantity_milli: l.quantity_milli,
      unit: l.unit,
      unit_price_cents: l.unit_price_cents,
      vat_rate: l.vat_rate,
    })),
  });

  const db = getDb();
  db.prepare(
    `UPDATE invoices SET is_credit_note = 1, credits_invoice_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(originalId, Date.now(), draft.id);
  logEvent(draft.id, "credit_note_created", { credits_invoice_id: originalId });

  return getInvoiceWithLines(draft.id)!;
}

export function cancelInvoice(id: string): InvoiceWithLines | null {
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM invoices WHERE id = ?")
    .get(id) as { status: string } | undefined;
  if (!row) return null;
  if (row.status === "paid") {
    throw new Error("Betaalde factuur kan niet worden geannuleerd");
  }
  const now = Date.now();
  db.prepare(
    "UPDATE invoices SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?",
  ).run(now, now, id);
  logEvent(id, "cancelled", null);

  // Reverse alle openstaande journaal-entries van deze factuur. Voorkomt
  // dat omzet/BTW in de boeken blijven staan terwijl de factuur juridisch
  // is ingetrokken.
  const entries = db
    .prepare(
      `SELECT id FROM journal_entries
       WHERE source_type = 'invoice' AND source_id = ?
         AND reversed_by IS NULL AND reverses_id IS NULL`,
    )
    .all(id) as Array<{ id: string }>;
  for (const e of entries) {
    try {
      reverseEntry(e.id, "Factuur geannuleerd");
      logEvent(id, "journal_reversed", { reversed_entry_id: e.id });
    } catch (err) {
      logEvent(id, "journal_reverse_failed", {
        entry_id: e.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return getInvoiceWithLines(id);
}

// ─── Internals ─────────────────────────────────────────────────────────────

function insertLines(
  invoiceId: string,
  lines: LineInput[],
  treatment: VatTreatment,
) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO invoice_lines
       (id, invoice_id, sort_order, description, quantity_milli, unit,
        unit_price_cents, vat_rate, line_total_cents, line_vat_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((line, idx) => {
    const calc = calculateLine(line, treatment);
    insert.run(
      crypto.randomUUID(),
      invoiceId,
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

function toLineInputs(lines: InvoiceLine[]): LineInput[] {
  return lines.map((l) => ({
    description: l.description,
    quantity_milli: l.quantity_milli,
    unit: l.unit,
    unit_price_cents: l.unit_price_cents,
    vat_rate: l.vat_rate,
  }));
}

function logEvent(invoiceId: string, type: string, payload: unknown) {
  const db = getDb();
  db.prepare(
    `INSERT INTO invoice_events (id, invoice_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    invoiceId,
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

/**
 * Sensible default VAT treatment based on the parties. User can override in
 * the editor — this only drives the initial value on create.
 */
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
