import type { InvoiceWithLines } from "@/lib/invoices";
import type { Client } from "@/lib/clients";

/**
 * Mock invoice used in the template editor preview. Same shape as a real
 * invoice so InvoiceDocument renders it identically.
 */
export function mockInvoice(
  companyId: string,
  language: "nl" | "en" = "nl",
): InvoiceWithLines {
  const now = Date.now();
  const issue = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const isEN = language === "en";
  return {
    id: "mock",
    company_id: companyId,
    client_id: "mock-client",
    number: "PREVIEW-0001",
    status: "sent",
    language,
    currency: "EUR",
    issue_date: issue,
    due_date: due,
    subtotal_cents: 180000,
    vat_total_cents: 37800,
    total_cents: 217800,
    vat_treatment: "standard",
    reference: "Order #A-1042",
    notes: isEN
      ? "Thanks for the trust. Any questions about this invoice? Feel free to reply."
      : "Bedankt voor het vertrouwen. Vragen over deze factuur? Mail gerust.",
    terms_text: isEN
      ? "Please settle this invoice within 14 days to the bank account below, citing the invoice number."
      : "Gelieve binnen 14 dagen te betalen op onderstaand rekeningnummer onder vermelding van het factuurnummer.",
    pdf_path: null,
    sent_at: now,
    paid_at: null,
    cancelled_at: null,
    postmark_message_id: null,
    company_snapshot_json: null,
    client_snapshot_json: null,
    open_count: 0,
    last_opened_at: null,
    link_click_count: 0,
    last_clicked_at: null,
    mollie_payment_id: null,
    mollie_payment_url: null,
    mollie_status: null,
    mollie_paid_at: null,
    public_token: null,
    reminder_count: 0,
    last_reminder_at: null,
    is_credit_note: 0,
    credits_invoice_id: null,
    created_at: now,
    updated_at: now,
    lines: [
      {
        id: "mock-1",
        invoice_id: "mock",
        sort_order: 0,
        description: isEN
          ? "Consulting — strategy workshop"
          : "Consultancy — strategie workshop",
        quantity_milli: 8000,
        unit: isEN ? "hour" : "uur",
        unit_price_cents: 15000,
        vat_rate: 21,
        line_total_cents: 120000,
        line_vat_cents: 25200,
      },
      {
        id: "mock-2",
        invoice_id: "mock",
        sort_order: 1,
        description: isEN
          ? "Report + presentation"
          : "Rapport + presentatie",
        quantity_milli: 1000,
        unit: isEN ? "item" : "stuk",
        unit_price_cents: 60000,
        vat_rate: 21,
        line_total_cents: 60000,
        line_vat_cents: 12600,
      },
    ],
  };
}

export function mockClient(): Client {
  return {
    id: "mock-client",
    name: "Voorbeeld B.V.",
    contact_name: "T.a.v. Jan Jansen",
    email: "jan@voorbeeld.nl",
    phone: null,
    kvk: "12345678",
    vat_number: "NL123456789B01",
    address_line1: "Voorbeeldstraat 42",
    address_line2: null,
    postal_code: "1234 AB",
    city: "Amsterdam",
    country: "NL",
    notes: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
