import { matchSupplier, createSupplier } from "@/lib/suppliers";
import {
  updatePurchaseInvoice,
  type PurchaseLineInput,
  type PurchaseUpdateInput,
} from "@/lib/purchase-invoices";
import { extractInvoiceFromPdf, eurosToCents, type OcrResult } from "./extract";
import {
  findHistoricalAccount,
  categoriseLines,
  buildSupplierHistorySnippet,
  type CategorisationSuggestion,
} from "./categorise";
import { getDb } from "@/lib/db";
import { log } from "@/lib/logger";
import crypto from "crypto";

/**
 * Run OCR voor een bestaande purchase_invoice met PDF, en update alle
 * velden + regels + (eventueel) supplier-koppeling. Status gaat naar
 * 'review' zodat user kan bevestigen.
 */
export async function ocrPurchaseInvoice(invoiceId: string): Promise<{
  matched_supplier_id: string | null;
  created_supplier_id: string | null;
  confidence: number;
}> {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, pdf_path, company_id FROM purchase_invoices WHERE id = ?",
    )
    .get(invoiceId) as
    | { id: string; pdf_path: string | null; company_id: string }
    | undefined;
  if (!row) throw new Error("Inkoopfactuur bestaat niet");
  if (!row.pdf_path) throw new Error("Geen PDF gekoppeld om te OCR'en");

  let result;
  try {
    result = await extractInvoiceFromPdf(row.pdf_path);
  } catch (err) {
    log.error(
      {
        scope: "accounting/ocr",
        invoice_id: invoiceId,
        err: err instanceof Error ? err.message : String(err),
      },
      "OCR call failed",
    );
    // Markeer als ocr_failed via event-log; status blijft draft
    db.prepare(
      `INSERT INTO purchase_invoice_events (id, purchase_invoice_id, type, payload_json, created_at)
       VALUES (?, ?, 'ocr_failed', ?, ?)`,
    ).run(
      crypto.randomUUID(),
      invoiceId,
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      Date.now(),
    );
    throw err;
  }

  const { ocr, tokens } = result;

  // Match leverancier
  let matchedId: string | null = null;
  let createdId: string | null = null;
  const supplierMatch = matchSupplier({
    kvk: ocr.supplier_kvk,
    vat_number: ocr.supplier_vat_number,
    iban: ocr.supplier_iban,
    name: ocr.supplier_name,
  });
  if (supplierMatch) {
    matchedId = supplierMatch.id;
  } else if (ocr.supplier_name) {
    // Geen match → maak nieuwe leverancier op basis van OCR-data
    const created = createSupplier({
      name: ocr.supplier_name,
      kvk: ocr.supplier_kvk || null,
      vat_number: ocr.supplier_vat_number || null,
      iban: ocr.supplier_iban?.replace(/\s+/g, "") || null,
      email: ocr.supplier_email || null,
    });
    createdId = created.id;
  }

  // Bouw regels
  const lines: PurchaseLineInput[] = ocr.lines.map((l) => ({
    description: l.description || "",
    quantity_milli: Math.round((l.quantity || 1) * 1000),
    unit: l.unit || null,
    unit_price_cents: eurosToCents(l.unit_price_excl || 0),
    vat_rate: typeof l.vat_rate === "number" ? l.vat_rate : 21,
  }));

  // Grootboek-suggesties — drie strategieën in volgorde van zekerheid:
  //   1. Historische match per supplier (most-used account)
  //   2. supplier.default_account_code
  //   3. AI-categorisatie via Claude Haiku per regel
  const supplierId = matchedId || createdId;
  let aiSuggestions: CategorisationSuggestion[] = [];
  if (supplierId) {
    const historical = findHistoricalAccount(supplierId);
    const sup = db
      .prepare(
        "SELECT default_account_code, name FROM suppliers WHERE id = ?",
      )
      .get(supplierId) as
      | { default_account_code: string | null; name: string }
      | undefined;
    const baseline = historical?.account_code || sup?.default_account_code;

    if (baseline) {
      for (const line of lines) {
        (line as PurchaseLineInput & {
          account_code?: string | null;
        }).account_code = baseline;
      }
    } else {
      try {
        aiSuggestions = await categoriseLines({
          supplier_name: sup?.name || ocr.supplier_name,
          supplier_history: buildSupplierHistorySnippet(supplierId) || null,
          lines: ocr.lines.map((l) => ({
            description: l.description || "",
            total_excl: l.line_total_excl || 0,
          })),
        });
        for (const sugg of aiSuggestions) {
          if (
            sugg.line_index >= 0 &&
            sugg.line_index < lines.length &&
            sugg.suggested_account_code
          ) {
            (lines[sugg.line_index] as PurchaseLineInput & {
              account_code?: string | null;
            }).account_code = sugg.suggested_account_code;
          }
        }
      } catch (err) {
        log.warn(
          {
            scope: "accounting/ocr",
            err: err instanceof Error ? err.message : String(err),
            invoice_id: invoiceId,
          },
          "AI-categorisatie faalde — regels blijven zonder grootboek",
        );
      }
    }
  }

  const patch: PurchaseUpdateInput = {
    supplier_id: supplierId,
    supplier_invoice_number: ocr.invoice_number,
    issue_date: ocr.issue_date,
    due_date: ocr.due_date,
    reference: ocr.reference,
    lines,
    status: "review",
  };

  // Bewaar OCR-raw + AI-categorisatie via direct UPDATE (updatePurchaseInvoice
  // heeft die velden niet in z'n patch-API)
  db.prepare(
    `UPDATE purchase_invoices SET
       ocr_raw_json = ?, ai_categorisation_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    JSON.stringify(ocr),
    aiSuggestions.length > 0 ? JSON.stringify(aiSuggestions) : null,
    Date.now(),
    invoiceId,
  );

  updatePurchaseInvoice(invoiceId, patch);

  // Audit-event
  db.prepare(
    `INSERT INTO purchase_invoice_events (id, purchase_invoice_id, type, payload_json, created_at)
     VALUES (?, ?, 'ocr_completed', ?, ?)`,
  ).run(
    crypto.randomUUID(),
    invoiceId,
    JSON.stringify({
      confidence: ocr.confidence,
      tokens,
      supplier_matched: !!matchedId,
      supplier_created: !!createdId,
    }),
    Date.now(),
  );

  return {
    matched_supplier_id: matchedId,
    created_supplier_id: createdId,
    confidence: ocr.confidence,
  };
}

export type { OcrResult };
