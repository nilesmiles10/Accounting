-- Quotes (offertes). Lijkt sterk op invoices maar eigen status-machine en
-- nummer-reeks. Accepteren van een offerte kan leiden tot een concept-factuur
-- (1-op-1 link via quotes.converted_invoice_id).

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft|sent|accepted|rejected|expired|converted
  language TEXT NOT NULL DEFAULT 'nl',
  currency TEXT NOT NULL DEFAULT 'EUR',
  issue_date TEXT NOT NULL,
  valid_until_date TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  vat_total_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  vat_treatment TEXT NOT NULL DEFAULT 'standard',
  reference TEXT,
  notes TEXT,
  terms_text TEXT,
  signature_line TEXT,
  sent_at INTEGER,
  accepted_at INTEGER,
  rejected_at INTEGER,
  expired_at INTEGER,
  emailed_at INTEGER,
  postmark_message_id TEXT,
  company_snapshot_json TEXT,
  client_snapshot_json TEXT,
  converted_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (company_id, number)
);

CREATE INDEX IF NOT EXISTS idx_quotes_company ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_issue ON quotes(issue_date);

CREATE TABLE IF NOT EXISTS quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit TEXT DEFAULT 'stuk',
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 21,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  line_vat_cents INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);

CREATE TABLE IF NOT EXISTS quote_events (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_events(quote_id);

-- Per-company offerte settings.
ALTER TABLE companies ADD COLUMN quote_number_prefix TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN quote_number_next INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN quote_number_padding INTEGER NOT NULL DEFAULT 4;
ALTER TABLE companies ADD COLUMN default_quote_validity_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE companies ADD COLUMN quote_signature_line_nl TEXT;
ALTER TABLE companies ADD COLUMN quote_signature_line_en TEXT;
