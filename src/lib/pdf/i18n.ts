export type Lang = "nl" | "en";

export interface InvoiceI18n {
  invoice: string;
  credit_note: string;
  credit_note_number: string;
  credit_note_for: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  reference: string;
  from: string;
  to: string;
  description: string;
  quantity: string;
  unit_price: string;
  vat_rate: string;
  line_total: string;
  subtotal: string;
  vat: string;
  total: string;
  payment_terms: string;
  notes: string;
  kvk: string;
  vat_number: string;
  iban: string;
  reverse_charge_note: string;
  export_note: string;
}

const NL: InvoiceI18n = {
  invoice: "FACTUUR",
  credit_note: "CREDITNOTA",
  credit_note_number: "Creditnr.",
  credit_note_for: "Creditnota voor factuur",
  invoice_number: "Factuurnr.",
  issue_date: "Factuurdatum",
  due_date: "Vervaldatum",
  reference: "Referentie",
  from: "Van",
  to: "Aan",
  description: "Omschrijving",
  quantity: "Aantal",
  unit_price: "Stukprijs",
  vat_rate: "BTW",
  line_total: "Totaal",
  subtotal: "Subtotaal",
  vat: "BTW",
  total: "Totaal",
  payment_terms: "Betalingsvoorwaarden",
  notes: "Opmerkingen",
  kvk: "KvK",
  vat_number: "BTW",
  iban: "IBAN",
  reverse_charge_note:
    "BTW verlegd naar ontvanger op basis van artikel 138 van de EU BTW-richtlijn (intracommunautaire levering).",
  export_note:
    "Export van diensten/goederen buiten de Europese Unie — BTW 0%.",
};

const EN: InvoiceI18n = {
  invoice: "INVOICE",
  credit_note: "CREDIT NOTE",
  credit_note_number: "Credit note no.",
  credit_note_for: "Credit note for invoice",
  invoice_number: "Invoice no.",
  issue_date: "Issue date",
  due_date: "Due date",
  reference: "Reference",
  from: "From",
  to: "Bill to",
  description: "Description",
  quantity: "Qty",
  unit_price: "Unit price",
  vat_rate: "VAT",
  line_total: "Total",
  subtotal: "Subtotal",
  vat: "VAT",
  total: "Total",
  payment_terms: "Payment terms",
  notes: "Notes",
  kvk: "CoC",
  vat_number: "VAT",
  iban: "IBAN",
  reverse_charge_note:
    "VAT reverse-charged to recipient under article 138 of the EU VAT Directive (intra-community supply).",
  export_note:
    "Export of services/goods outside the European Union — 0% VAT.",
};

export function t(lang: Lang): InvoiceI18n {
  return lang === "en" ? EN : NL;
}
