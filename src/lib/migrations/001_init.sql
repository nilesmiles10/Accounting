-- Accounting module — initial schema.
-- Multi-company issuer side (Intersumma, Kisou, ...) + recipient clients.
-- All monetary amounts stored as INTEGER cents to avoid float rounding.

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  kvk TEXT,
  vat_number TEXT,
  iban TEXT,
  bic TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'NL',
  logo_path TEXT,
  accent_color TEXT DEFAULT '#6366f1',
  default_language TEXT NOT NULL DEFAULT 'nl',
  default_payment_terms_days INTEGER NOT NULL DEFAULT 14,
  default_terms_text TEXT,
  invoice_number_prefix TEXT NOT NULL DEFAULT '',
  invoice_number_next INTEGER NOT NULL DEFAULT 1,
  invoice_number_padding INTEGER NOT NULL DEFAULT 4,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  kvk TEXT,
  vat_number TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'NL',
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|sent|paid|overdue|cancelled
  language TEXT NOT NULL DEFAULT 'nl',  -- nl|en
  currency TEXT NOT NULL DEFAULT 'EUR',
  issue_date TEXT NOT NULL,             -- ISO date yyyy-mm-dd
  due_date TEXT NOT NULL,
  -- Totals in cents
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  vat_total_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  -- VAT treatment per invoice (line rates may differ but this drives the footer)
  vat_treatment TEXT NOT NULL DEFAULT 'standard',
  -- standard | reverse_charge_eu | export_outside_eu
  reference TEXT,
  notes TEXT,
  terms_text TEXT,
  pdf_path TEXT,
  sent_at INTEGER,
  paid_at INTEGER,
  cancelled_at INTEGER,
  postmark_message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (company_id, number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL DEFAULT 1000, -- quantity * 1000 (3 decimals)
  unit TEXT DEFAULT 'stuk',
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 21, -- 0 | 9 | 21
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  line_vat_cents INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- Audit trail; foundation for future ledger/journal entries.
CREATE TABLE IF NOT EXISTS invoice_events (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- created|updated|sent|paid|cancelled|pdf_generated|email_failed
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON invoice_events(invoice_id);

-- Global settings (Postmark token, email templates, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
