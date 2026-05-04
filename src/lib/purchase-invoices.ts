import crypto from "crypto";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCompany } from "@/lib/companies";
import { getSupplier } from "@/lib/suppliers";
import {
  postPurchaseApproved,
  postPurchasePaid,
} from "@/lib/ledger/auto-post";
import { reverseEntry } from "@/lib/ledger/journal";

export type PurchaseStatus =
  | "draft"
  | "review"
  | "approved"
  | "paid"
  | "cancelled";

export interface PurchaseInvoice {
  id: string;
  tenant_id: string;
  company_id: string;
  supplier_id: string | null;
  status: PurchaseStatus;
  supplier_invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  reference: string | null;
  currency: string;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  pdf_path: string | null;
  source: string;
  source_email_subject: string | null;
  source_email_from: string | null;
  ocr_raw_json: string | null;
  ai_categorisation_json: string | null;
  approved_at: number | null;
  paid_at: number | null;
  cancelled_at: number | null;
  bank_transaction_id: string | null;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface PurchaseInvoiceLine {
  id: string;
  purchase_invoice_id: string;
  sort_order: number;
  description: string;
  quantity_milli: number;
  unit: string | null;
  unit_price_cents: number;
  vat_rate: number;
  line_total_cents: number;
  line_vat_cents: number;
  account_code: string | null;
}

export interface PurchaseInvoiceWithLines extends PurchaseInvoice {
  lines: PurchaseInvoiceLine[];
}

export interface PurchaseListItem extends PurchaseInvoice {
  company_name: string;
  supplier_name: string | null;
}

export interface PurchaseLineInput {
  description: string;
  quantity_milli: number;
  unit?: string | null;
  unit_price_cents: number;
  vat_rate: number;
  account_code?: string | null;
}

export interface PurchaseDraftInput {
  company_id: string;
  supplier_id?: string | null;
  supplier_invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  reference?: string | null;
  currency?: string;
  pdf_path?: string | null;
  source?: string;
  source_email_subject?: string | null;
  source_email_from?: string | null;
  ocr_raw_json?: string | null;
  ai_categorisation_json?: string | null;
  notes?: string | null;
  lines?: PurchaseLineInput[];
}

export type PurchaseUpdateInput = Partial<PurchaseDraftInput> & {
  status?: PurchaseStatus;
};

// ─── Calculations ──────────────────────────────────────────────────────────

export function calcLine(line: PurchaseLineInput): {
  line_total_cents: number;
  line_vat_cents: number;
} {
  const subtotal = Math.round(
    (line.quantity_milli * line.unit_price_cents) / 1000,
  );
  const vat = Math.round((subtotal * line.vat_rate) / 100);
  return { line_total_cents: subtotal, line_vat_cents: vat };
}

export function calcTotals(lines: PurchaseLineInput[]): {
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
} {
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    const c = calcLine(l);
    subtotal += c.line_total_cents;
    vat += c.line_vat_cents;
  }
  return {
    subtotal_cents: subtotal,
    vat_total_cents: vat,
    total_cents: subtotal + vat,
  };
}

// ─── Queries ───────────────────────────────────────────────────────────────

export function listPurchaseInvoices(filter?: {
  status?: PurchaseStatus;
  company_id?: string;
  supplier_id?: string;
}): PurchaseListItem[] {
  const db = getDb();
  const where: string[] = ["p.tenant_id = ?"];
  const values: unknown[] = [getCurrentTenantId()];
  if (filter?.status) {
    where.push("p.status = ?");
    values.push(filter.status);
  }
  if (filter?.company_id) {
    where.push("p.company_id = ?");
    values.push(filter.company_id);
  }
  if (filter?.supplier_id) {
    where.push("p.supplier_id = ?");
    values.push(filter.supplier_id);
  }
  return db
    .prepare(
      `SELECT p.*,
              c.name AS company_name,
              s.name AS supplier_name
       FROM purchase_invoices p
       JOIN companies c ON c.id = p.company_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(p.issue_date, '') DESC, p.created_at DESC`,
    )
    .all(...values) as PurchaseListItem[];
}

export function getPurchaseInvoiceWithLines(
  id: string,
): PurchaseInvoiceWithLines | null {
  const db = getDb();
  const inv = db
    .prepare(
      "SELECT * FROM purchase_invoices WHERE id = ? AND tenant_id = ?",
    )
    .get(id, getCurrentTenantId()) as PurchaseInvoice | undefined;
  if (!inv) return null;
  const lines = db
    .prepare(
      "SELECT * FROM purchase_invoice_lines WHERE purchase_invoice_id = ? ORDER BY sort_order, id",
    )
    .all(id) as PurchaseInvoiceLine[];
  return { ...inv, lines };
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export function createPurchaseInvoice(
  input: PurchaseDraftInput,
): PurchaseInvoiceWithLines {
  const company = getCompany(input.company_id);
  if (!company) throw new Error("Bedrijf bestaat niet");
  if (input.supplier_id && !getSupplier(input.supplier_id)) {
    throw new Error("Leverancier bestaat niet");
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const lines = input.lines || [];
  const totals = calcTotals(lines);

  // Status: 'review' als er OCR-data is, anders 'draft'
  const status: PurchaseStatus = input.ocr_raw_json ? "review" : "draft";

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO purchase_invoices (
         id, tenant_id, company_id, supplier_id, status,
         supplier_invoice_number, issue_date, due_date, reference,
         currency, subtotal_cents, vat_total_cents, total_cents,
         pdf_path, source, source_email_subject, source_email_from,
         ocr_raw_json, ai_categorisation_json, notes,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      getCurrentTenantId(),
      input.company_id,
      input.supplier_id ?? null,
      status,
      input.supplier_invoice_number ?? null,
      input.issue_date ?? null,
      input.due_date ?? null,
      input.reference ?? null,
      input.currency ?? "EUR",
      totals.subtotal_cents,
      totals.vat_total_cents,
      totals.total_cents,
      input.pdf_path ?? null,
      input.source ?? "upload",
      input.source_email_subject ?? null,
      input.source_email_from ?? null,
      input.ocr_raw_json ?? null,
      input.ai_categorisation_json ?? null,
      input.notes ?? null,
      now,
      now,
    );
    insertLines(id, lines);
    logEvent(id, "created", { source: input.source ?? "upload" });
  });
  tx();
  return getPurchaseInvoiceWithLines(id)!;
}

export function updatePurchaseInvoice(
  id: string,
  patch: PurchaseUpdateInput,
): PurchaseInvoiceWithLines | null {
  const current = getPurchaseInvoiceWithLines(id);
  if (!current) return null;
  if (current.status === "paid" || current.status === "cancelled") {
    throw new Error(
      "Betaalde of geannuleerde factuur kan niet worden bewerkt",
    );
  }
  if (patch.supplier_id && !getSupplier(patch.supplier_id)) {
    throw new Error("Leverancier bestaat niet");
  }

  const db = getDb();
  const merged = {
    company_id: patch.company_id ?? current.company_id,
    supplier_id:
      patch.supplier_id !== undefined
        ? patch.supplier_id
        : current.supplier_id,
    status: patch.status ?? current.status,
    supplier_invoice_number:
      patch.supplier_invoice_number ?? current.supplier_invoice_number,
    issue_date: patch.issue_date ?? current.issue_date,
    due_date: patch.due_date ?? current.due_date,
    reference: patch.reference ?? current.reference,
    notes: patch.notes ?? current.notes,
  };

  const lines: PurchaseLineInput[] =
    patch.lines ??
    current.lines.map((l) => ({
      description: l.description,
      quantity_milli: l.quantity_milli,
      unit: l.unit,
      unit_price_cents: l.unit_price_cents,
      vat_rate: l.vat_rate,
      account_code: l.account_code,
    }));
  const totals = calcTotals(lines);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE purchase_invoices SET
         company_id = ?, supplier_id = ?, status = ?,
         supplier_invoice_number = ?, issue_date = ?, due_date = ?,
         reference = ?, notes = ?,
         subtotal_cents = ?, vat_total_cents = ?, total_cents = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.company_id,
      merged.supplier_id,
      merged.status,
      merged.supplier_invoice_number,
      merged.issue_date,
      merged.due_date,
      merged.reference,
      merged.notes,
      totals.subtotal_cents,
      totals.vat_total_cents,
      totals.total_cents,
      Date.now(),
      id,
    );
    if (patch.lines) {
      db.prepare(
        "DELETE FROM purchase_invoice_lines WHERE purchase_invoice_id = ?",
      ).run(id);
      insertLines(id, patch.lines);
    }
    logEvent(id, "updated", null);
  });
  tx();
  return getPurchaseInvoiceWithLines(id);
}

export function approvePurchaseInvoice(
  id: string,
): PurchaseInvoiceWithLines {
  const current = getPurchaseInvoiceWithLines(id);
  if (!current) throw new Error("Inkoopfactuur bestaat niet");
  if (current.status === "approved" || current.status === "paid") {
    return current;
  }
  if (current.status === "cancelled") {
    throw new Error("Geannuleerde factuur kan niet worden goedgekeurd");
  }
  if (current.lines.length === 0) {
    throw new Error("Inkoopfactuur heeft geen regels");
  }
  if (!current.supplier_id) {
    throw new Error(
      "Leverancier is verplicht — koppel of maak een leverancier aan",
    );
  }
  if (!current.supplier_invoice_number) {
    throw new Error("Factuurnummer van leverancier ontbreekt");
  }
  if (!current.issue_date) {
    throw new Error("Factuurdatum ontbreekt");
  }

  const now = Date.now();
  const db = getDb();
  db.prepare(
    `UPDATE purchase_invoices SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, id);
  logEvent(id, "approved", null);

  // Auto-learn: zet supplier.default_account_code als 'ie nog leeg is en
  // alle regels op deze factuur dezelfde rekening hebben. Volgende keer
  // krijgt deze leverancier dat als auto-fill, geen Haiku-call nodig.
  if (current.supplier_id) {
    const accountCodes = current.lines
      .map((l) => l.account_code)
      .filter((c): c is string => !!c);
    const allSame =
      accountCodes.length > 0 &&
      accountCodes.every((c) => c === accountCodes[0]);
    if (allSame) {
      db.prepare(
        `UPDATE suppliers SET default_account_code = ?, updated_at = ?
         WHERE id = ? AND (default_account_code IS NULL OR default_account_code = '')`,
      ).run(accountCodes[0], Date.now(), current.supplier_id);
    }
  }

  // Auto-journalisatie: kosten + BTW vorderingen / crediteuren
  const journalId = postPurchaseApproved(id);
  if (journalId) {
    db.prepare(
      `UPDATE purchase_invoices SET journal_entry_id = ?, updated_at = ? WHERE id = ?`,
    ).run(journalId, Date.now(), id);
    logEvent(id, "journalised", { journal_entry_id: journalId });
  }
  return getPurchaseInvoiceWithLines(id)!;
}

/**
 * Markeer inkoopfactuur als betaald. Boekt:
 *   Debet 1600 Crediteuren / Credit 1100 Bank (of opgegeven rekening)
 *
 * Volgt boekhoudregel: status muteert alleen via deze functie, en de
 * tegenboeking gaat via auto-post zodat 1600 Crediteuren weer afloopt.
 * Zonder dit blijft 1600 oneindig oplopen → balans klopt niet.
 */
export function markPurchasePaid(
  id: string,
  options?: { bankAccountCode?: string; paidDate?: string },
): PurchaseInvoiceWithLines | null {
  const current = getPurchaseInvoiceWithLines(id);
  if (!current) return null;
  if (current.status === "paid") return current;
  if (current.status === "draft" || current.status === "review") {
    throw new Error(
      "Concept of nog te beoordelen — keur eerst goed voordat je 'm op betaald zet",
    );
  }
  if (current.status === "cancelled") {
    throw new Error("Geannuleerde factuur kan niet betaald worden");
  }

  const now = Date.now();
  const db = getDb();
  const paidAtMs = options?.paidDate
    ? new Date(options.paidDate).getTime()
    : now;
  db.prepare(
    `UPDATE purchase_invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`,
  ).run(paidAtMs, now, id);
  logEvent(id, "paid", {
    bank_account_code: options?.bankAccountCode || "1100",
    paid_date: options?.paidDate || null,
  });

  const journalId = postPurchasePaid(
    id,
    options?.bankAccountCode,
    options?.paidDate,
  );
  if (journalId) {
    logEvent(id, "journalised_payment", { journal_entry_id: journalId });
  }
  return getPurchaseInvoiceWithLines(id);
}

export function cancelPurchaseInvoice(
  id: string,
): PurchaseInvoiceWithLines | null {
  const current = getPurchaseInvoiceWithLines(id);
  if (!current) return null;
  if (current.status === "paid") {
    throw new Error(
      "Betaalde factuur kan niet worden geannuleerd — boek tegen via correctie",
    );
  }
  const now = Date.now();
  const db = getDb();
  db.prepare(
    `UPDATE purchase_invoices SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, id);
  logEvent(id, "cancelled", null);

  // Reverse alle openstaande journaal-entries — kosten en voorbelasting
  // mogen niet in de boeken blijven staan na annulering.
  const entries = db
    .prepare(
      `SELECT id FROM journal_entries
       WHERE source_type = 'purchase' AND source_id = ?
         AND reversed_by IS NULL AND reverses_id IS NULL`,
    )
    .all(id) as Array<{ id: string }>;
  for (const e of entries) {
    try {
      reverseEntry(e.id, "Inkoopfactuur geannuleerd");
      logEvent(id, "journal_reversed", { reversed_entry_id: e.id });
    } catch (err) {
      logEvent(id, "journal_reverse_failed", {
        entry_id: e.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return getPurchaseInvoiceWithLines(id);
}

export function deletePurchaseInvoice(id: string): boolean {
  const current = getPurchaseInvoiceWithLines(id);
  if (!current) return false;
  if (current.status !== "draft" && current.status !== "review") {
    throw new Error(
      "Alleen drafts en review-facturen kunnen verwijderd worden — annuleer anders",
    );
  }
  const res = getDb()
    .prepare("DELETE FROM purchase_invoices WHERE id = ?")
    .run(id);
  return res.changes > 0;
}

// ─── Internals ─────────────────────────────────────────────────────────────

function insertLines(invoiceId: string, lines: PurchaseLineInput[]) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO purchase_invoice_lines
       (id, purchase_invoice_id, sort_order, description, quantity_milli,
        unit, unit_price_cents, vat_rate, line_total_cents, line_vat_cents,
        account_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((line, idx) => {
    const calc = calcLine(line);
    insert.run(
      crypto.randomUUID(),
      invoiceId,
      idx,
      line.description,
      line.quantity_milli,
      line.unit ?? null,
      line.unit_price_cents,
      line.vat_rate,
      calc.line_total_cents,
      calc.line_vat_cents,
      line.account_code ?? null,
    );
  });
}

function logEvent(invoiceId: string, type: string, payload: unknown) {
  const db = getDb();
  db.prepare(
    `INSERT INTO purchase_invoice_events (id, purchase_invoice_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    invoiceId,
    type,
    payload === null || payload === undefined
      ? null
      : JSON.stringify(payload),
    Date.now(),
  );
}
