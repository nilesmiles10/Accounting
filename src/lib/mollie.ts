import crypto from "crypto";
import createMollieClient, {
  PaymentStatus,
  type Payment,
} from "@mollie/api-client";
import { getSetting, setSetting } from "@/lib/settings";
import { getDb } from "@/lib/db";
import {
  getInvoiceWithLines,
  getRenderContext,
  markPaid,
  type InvoiceWithLines,
} from "@/lib/invoices";
import { log } from "@/lib/logger";
import { getAccountingBaseUrl } from "@/lib/branding";

// ─── Settings ──────────────────────────────────────────────────────────────

export interface MollieSettings {
  api_key: string;
  test_mode: boolean;
  description_template: string; // bv. "Factuur {{number}} — {{company}}"
}

const MOLLIE_KEY = "mollie";

export function getMollieSettings(): MollieSettings {
  return getSetting<MollieSettings>(MOLLIE_KEY, {
    api_key: "",
    test_mode: false,
    description_template: "Factuur {{number}}",
  });
}

export function setMollieSettings(next: MollieSettings): void {
  setSetting(MOLLIE_KEY, next);
}

// ─── Client ────────────────────────────────────────────────────────────────

function mollieClient() {
  const { api_key } = getMollieSettings();
  if (!api_key) throw new Error("Mollie API key ontbreekt");
  return createMollieClient({ apiKey: api_key });
}

/**
 * Maak (of refresh) een Mollie payment voor een factuur en bewaar ID + URL.
 * Idempotent: als de factuur al een open payment heeft, geeft 'ie die
 * terug zonder nieuwe te maken.
 */
export async function createOrReusePayment(
  invoiceId: string,
): Promise<InvoiceWithLines> {
  const invoice = getInvoiceWithLines(invoiceId);
  if (!invoice) throw new Error("Factuur bestaat niet");
  if (invoice.status === "draft") {
    throw new Error("Concept kan geen betaallink krijgen — finaliseer eerst");
  }
  if (invoice.status === "cancelled") {
    throw new Error("Geannuleerde factuur kan geen betaallink krijgen");
  }
  if (invoice.status === "paid") {
    throw new Error("Factuur is al betaald");
  }

  // Al een bestaande payment? Check status via Mollie.
  if (invoice.mollie_payment_id) {
    try {
      const existing = await mollieClient().payments.get(
        invoice.mollie_payment_id,
      );
      // Open/pending → hergebruik; anders nieuwe aanmaken.
      if (
        existing.status === PaymentStatus.open ||
        existing.status === PaymentStatus.pending
      ) {
        storeMollieState(invoiceId, existing);
        return getInvoiceWithLines(invoiceId)!;
      }
    } catch (err) {
      log.warn(
        {
          scope: "accounting/mollie",
          err: err instanceof Error ? err.message : String(err),
          invoice_id: invoiceId,
        },
        "bestaande payment kon niet opgehaald worden, nieuwe maken",
      );
    }
  }

  const { company } = getRenderContext(invoice);
  const baseUrl = getAccountingBaseUrl();
  const webhookUrl = `${baseUrl}/api/mollie/webhook`;
  const returnUrl = `${baseUrl}/accounting/invoices/${invoiceId}/payment-return`;

  const { description_template } = getMollieSettings();
  const description = substitute(description_template || "Factuur {{number}}", {
    number: invoice.number,
    company: company.name,
  });

  const payment = await mollieClient().payments.create({
    amount: {
      currency: invoice.currency || "EUR",
      value: (invoice.total_cents / 100).toFixed(2),
    },
    description,
    redirectUrl: returnUrl,
    webhookUrl,
    metadata: { invoice_id: invoiceId },
  });

  storeMollieState(invoiceId, payment);
  return getInvoiceWithLines(invoiceId)!;
}

/**
 * Webhook-handler: Mollie POSTt hier met body { id: "tr_xxx" }. Wij halen
 * de payment op (authoritative) en updaten onze factuur-status.
 */
export async function handleWebhookById(paymentId: string): Promise<void> {
  const payment = await mollieClient().payments.get(paymentId);
  const db = getDb();

  const row = db
    .prepare(
      "SELECT id FROM invoices WHERE mollie_payment_id = ? LIMIT 1",
    )
    .get(paymentId) as { id: string } | undefined;

  const invoiceId =
    row?.id ||
    ((payment.metadata as { invoice_id?: string } | null)?.invoice_id ?? null);

  if (!invoiceId) {
    log.warn(
      { scope: "accounting/mollie-webhook", payment_id: paymentId },
      "geen bijpassende factuur voor payment",
    );
    return;
  }

  storeMollieState(invoiceId, payment);

  if (payment.status === PaymentStatus.paid) {
    const invoice = getInvoiceWithLines(invoiceId);
    if (invoice && invoice.status !== "paid") {
      try {
        markPaid(invoiceId);
      } catch (err) {
        log.error(
          {
            scope: "accounting/mollie-webhook",
            err: err instanceof Error ? err.message : String(err),
            invoice_id: invoiceId,
          },
          "markPaid na mollie-paid faalde",
        );
      }
    }
  }

  logInvoiceEvent(invoiceId, "mollie_webhook", {
    payment_id: paymentId,
    status: payment.status,
  });
}

function storeMollieState(invoiceId: string, payment: Payment): void {
  const db = getDb();
  const url = payment.getCheckoutUrl?.() || null;
  const paidAt =
    payment.status === PaymentStatus.paid && payment.paidAt
      ? new Date(payment.paidAt).getTime()
      : null;
  db.prepare(
    `UPDATE invoices SET
       mollie_payment_id = ?,
       mollie_payment_url = ?,
       mollie_status = ?,
       mollie_paid_at = COALESCE(?, mollie_paid_at),
       updated_at = ?
     WHERE id = ?`,
  ).run(payment.id, url, payment.status, paidAt, Date.now(), invoiceId);
}

function logInvoiceEvent(
  invoiceId: string,
  type: string,
  payload: unknown,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO invoice_events (id, invoice_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    invoiceId,
    type,
    JSON.stringify(payload),
    Date.now(),
  );
}

function substitute(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
}
