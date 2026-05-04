/**
 * Auto-journalisatie: hooks voor de standaard accounting-events.
 * Elke functie produceert een gebalanceerde journal_entry en koppelt 'm
 * aan het bron-record (invoice / purchase / bank).
 */

import { post } from "./journal";
import { getInvoiceWithLines } from "@/lib/invoices";
import { getPurchaseInvoiceWithLines } from "@/lib/purchase-invoices";
import { log } from "@/lib/logger";

// ─── Standaard rekeningnummers ─────────────────────────────────────────────
// Bij afwijkende setup overrulen via env (later) of per-bedrijf settings.

const ACCOUNT_DEBITORS = "1300";        // Te ontvangen van klanten
const ACCOUNT_CREDITORS = "1600";       // Te betalen aan leveranciers
const ACCOUNT_VAT_RECEIVABLE = "1500";  // Voorbelasting
const ACCOUNT_VAT_PAYABLE = "1700";     // BTW te betalen
const ACCOUNT_DEFAULT_EXPENSE = "4000"; // Algemene kosten — fallback
const ACCOUNT_DEFAULT_BANK = "1100";    // Rabobank — bank-match fallback

function omzetAccountFor(rate: number, vatTreatment: string): string {
  if (vatTreatment === "reverse_charge_eu") return "8003";
  if (vatTreatment === "export_outside_eu") return "8004";
  if (rate === 21) return "8000";
  if (rate === 9) return "8001";
  return "8002"; // 0% binnenland of vrijgesteld
}

function vatCodeFor(rate: number, vatTreatment: string): string {
  if (vatTreatment === "reverse_charge_eu") return "0EU";
  if (vatTreatment === "export_outside_eu") return "0EX";
  if (rate === 21) return "21";
  if (rate === 9) return "9";
  return "0";
}

// ─── Verkoopfactuur gefinaliseerd ─────────────────────────────────────────
// Boeking: Debet 1300 (Debiteuren) / Credit 8xxx (Omzet) + 1700 (BTW)

export function postInvoiceFinalized(invoiceId: string): string | null {
  const inv = getInvoiceWithLines(invoiceId);
  if (!inv) return null;
  const isCredit = inv.is_credit_note === 1;

  // Group regels per BTW-tarief
  const omzetByRate = new Map<number, number>(); // rate → subtotal
  const vatByRate = new Map<number, number>();
  for (const line of inv.lines) {
    const rate =
      inv.vat_treatment === "standard" ? line.vat_rate : 0;
    omzetByRate.set(
      rate,
      (omzetByRate.get(rate) || 0) + line.line_total_cents,
    );
    if (inv.vat_treatment === "standard") {
      vatByRate.set(rate, (vatByRate.get(rate) || 0) + line.line_vat_cents);
    }
  }

  const lines: Parameters<typeof post>[0]["lines"] = [];

  // Standaard factuur: Debet Debiteuren / Credit Omzet + BTW
  // Creditnota: omgekeerd — Credit Debiteuren / Debet Omzet + BTW
  // (zorgt dat 1300 verlaagd wordt en omzet/BTW negatief in de aangifte)

  lines.push({
    account_code: ACCOUNT_DEBITORS,
    description: `${isCredit ? "Creditnota" : "Factuur"} ${inv.number}`,
    [isCredit ? "credit_cents" : "debit_cents"]: inv.total_cents,
    client_id: inv.client_id,
  });

  Array.from(omzetByRate.entries()).forEach(([rate, base]) => {
    if (base === 0) return;
    lines.push({
      account_code: omzetAccountFor(rate, inv.vat_treatment),
      description: `Omzet ${rate}%${isCredit ? " (creditnota)" : ""}`,
      [isCredit ? "debit_cents" : "credit_cents"]: base,
      vat_code: vatCodeFor(rate, inv.vat_treatment),
      client_id: inv.client_id,
    });
  });

  Array.from(vatByRate.entries()).forEach(([rate, vat]) => {
    if (vat === 0) return;
    lines.push({
      account_code: ACCOUNT_VAT_PAYABLE,
      description: `BTW ${rate}% — ${isCredit ? "creditnota" : "factuur"} ${inv.number}`,
      [isCredit ? "debit_cents" : "credit_cents"]: vat,
      vat_code: vatCodeFor(rate, inv.vat_treatment),
      client_id: inv.client_id,
    });
  });

  try {
    const entry = post({
      date: inv.issue_date,
      description: `${isCredit ? "Creditnota" : "Verkoopfactuur"} ${inv.number}`,
      source_type: "invoice",
      source_id: inv.id,
      company_id: inv.company_id,
      lines,
    });
    return entry.id;
  } catch (err) {
    log.error(
      {
        scope: "accounting/auto-post",
        invoice_id: invoiceId,
        err: err instanceof Error ? err.message : String(err),
      },
      "auto-post finalize faalde — boeking ontbreekt",
    );
    return null;
  }
}

// ─── Verkoopfactuur betaald ───────────────────────────────────────────────
// Boeking: Debet 1100 (Bank) / Credit 1300 (Debiteuren)

export function postInvoicePaid(
  invoiceId: string,
  bankAccountCode: string = ACCOUNT_DEFAULT_BANK,
  paidDate?: string,
): string | null {
  const inv = getInvoiceWithLines(invoiceId);
  if (!inv) return null;
  const date = paidDate || new Date().toISOString().slice(0, 10);
  try {
    const entry = post({
      date,
      description: `Betaling factuur ${inv.number}`,
      source_type: "invoice",
      source_id: inv.id,
      company_id: inv.company_id,
      lines: [
        {
          account_code: bankAccountCode,
          description: `Ontvangen ${inv.number}`,
          debit_cents: inv.total_cents,
          client_id: inv.client_id,
        },
        {
          account_code: ACCOUNT_DEBITORS,
          description: `Aflossing debiteur — ${inv.number}`,
          credit_cents: inv.total_cents,
          client_id: inv.client_id,
        },
      ],
    });
    return entry.id;
  } catch (err) {
    log.error(
      {
        scope: "accounting/auto-post",
        invoice_id: invoiceId,
        err: err instanceof Error ? err.message : String(err),
      },
      "auto-post payment faalde",
    );
    return null;
  }
}

// ─── Inkoopfactuur goedgekeurd ────────────────────────────────────────────
// Boeking: Debet 4xxx (Kosten per regel) + 1500 (BTW vorderingen)
//          Credit 1600 (Crediteuren)

export function postPurchaseApproved(purchaseId: string): string | null {
  const inv = getPurchaseInvoiceWithLines(purchaseId);
  if (!inv) return null;
  if (!inv.issue_date) {
    log.warn(
      { scope: "accounting/auto-post", purchase_id: purchaseId },
      "geen issue_date — boekingsdatum vandaag",
    );
  }
  const date = inv.issue_date || new Date().toISOString().slice(0, 10);

  const lines: Parameters<typeof post>[0]["lines"] = [];

  // Debet: kosten per regel met grootboekrekening
  for (const line of inv.lines) {
    if (line.line_total_cents === 0) continue;
    lines.push({
      account_code: line.account_code || ACCOUNT_DEFAULT_EXPENSE,
      description: line.description,
      debit_cents: line.line_total_cents,
      vat_code: vatCodeFor(line.vat_rate, "standard"),
      supplier_id: inv.supplier_id,
    });
  }

  // Debet: voorbelasting (BTW vorderingen) — som over alle regels
  const vatTotal = inv.lines.reduce(
    (s, l) => s + (l.line_vat_cents || 0),
    0,
  );
  if (vatTotal > 0) {
    lines.push({
      account_code: ACCOUNT_VAT_RECEIVABLE,
      description: `Voorbelasting — ${inv.supplier_invoice_number || ""}`,
      debit_cents: vatTotal,
      supplier_id: inv.supplier_id,
    });
  }

  // Credit: crediteuren (totaalbedrag)
  lines.push({
    account_code: ACCOUNT_CREDITORS,
    description: `Inkoopfactuur ${inv.supplier_invoice_number || inv.id.slice(0, 8)}`,
    credit_cents: inv.total_cents,
    supplier_id: inv.supplier_id,
  });

  try {
    const entry = post({
      date,
      description: `Inkoopfactuur ${inv.supplier_invoice_number || ""}`.trim(),
      source_type: "purchase",
      source_id: inv.id,
      company_id: inv.company_id,
      lines,
    });
    return entry.id;
  } catch (err) {
    log.error(
      {
        scope: "accounting/auto-post",
        purchase_id: purchaseId,
        err: err instanceof Error ? err.message : String(err),
      },
      "auto-post purchase approve faalde",
    );
    return null;
  }
}

// ─── Inkoopfactuur betaald ────────────────────────────────────────────────
// Boeking: Debet 1600 (Crediteuren) / Credit 1100 (Bank)

export function postPurchasePaid(
  purchaseId: string,
  bankAccountCode: string = ACCOUNT_DEFAULT_BANK,
  paidDate?: string,
): string | null {
  const inv = getPurchaseInvoiceWithLines(purchaseId);
  if (!inv) return null;
  const date = paidDate || new Date().toISOString().slice(0, 10);
  try {
    const entry = post({
      date,
      description: `Betaling inkoop ${inv.supplier_invoice_number || ""}`.trim(),
      source_type: "purchase",
      source_id: inv.id,
      company_id: inv.company_id,
      lines: [
        {
          account_code: ACCOUNT_CREDITORS,
          description: `Aflossing crediteur — ${inv.supplier_invoice_number || ""}`,
          debit_cents: inv.total_cents,
          supplier_id: inv.supplier_id,
        },
        {
          account_code: bankAccountCode,
          description: `Betaald ${inv.supplier_invoice_number || ""}`,
          credit_cents: inv.total_cents,
          supplier_id: inv.supplier_id,
        },
      ],
    });
    return entry.id;
  } catch (err) {
    log.error(
      {
        scope: "accounting/auto-post",
        purchase_id: purchaseId,
        err: err instanceof Error ? err.message : String(err),
      },
      "auto-post purchase paid faalde",
    );
    return null;
  }
}
