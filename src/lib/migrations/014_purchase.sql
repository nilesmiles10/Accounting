-- Inkoop-flow: leveranciers + ontvangen inkoopfacturen.
-- Volledig gescheiden van outgoing invoices; geen overlap in tabellen.

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  legal_name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  kvk TEXT,
  vat_number TEXT,
  iban TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'NL',
  -- Standaard-grootboekrekening voor deze leverancier — versnelt
  -- categorisatie (bv. Adobe → 4600 ICT-software)
  default_account_code TEXT,
  default_vat_rate INTEGER DEFAULT 21,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_kvk ON suppliers(kvk) WHERE kvk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_vat ON suppliers(vat_number) WHERE vat_number IS NOT NULL;

-- Status-machine inkoopfactuur:
--   draft     = handmatig gestart, nog niet OCR'd
--   review    = OCR/AI klaar, wacht op gebruiker-bevestiging
--   approved  = goedgekeurd, klaar om geboekt + betaald te worden
--   paid      = bank-match heeft betaling toegekend
--   cancelled = handmatig geannuleerd (geen boeking)
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  -- Voor welk eigen bedrijf is deze inkoop (Intersumma/Maelilly/Kisou)
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  -- Leveranciers-factuurgegevens
  supplier_invoice_number TEXT,
  issue_date TEXT,
  due_date TEXT,
  reference TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  vat_total_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  -- Bron + raw data
  pdf_path TEXT,
  source TEXT NOT NULL DEFAULT 'upload',  -- upload|email|manual
  source_email_subject TEXT,
  source_email_from TEXT,
  ocr_raw_json TEXT,
  ai_categorisation_json TEXT,
  -- State transitions
  approved_at INTEGER,
  paid_at INTEGER,
  cancelled_at INTEGER,
  bank_transaction_id TEXT,
  journal_entry_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_tenant ON purchase_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_company ON purchase_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_purchase_issue ON purchase_invoices(issue_date);

CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id TEXT PRIMARY KEY,
  purchase_invoice_id TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit TEXT,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 21,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  line_vat_cents INTEGER NOT NULL DEFAULT 0,
  -- Per-regel grootboekrekening; valt terug op supplier.default_account_code
  account_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_purchase_lines_invoice ON purchase_invoice_lines(purchase_invoice_id);

CREATE TABLE IF NOT EXISTS purchase_invoice_events (
  id TEXT PRIMARY KEY,
  purchase_invoice_id TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_events_invoice ON purchase_invoice_events(purchase_invoice_id);
