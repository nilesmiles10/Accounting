-- Bank-import laag: gemeenschappelijk schema voor verschillende
-- providers (CAMT.053 upload, PayPal API, GoCardless aggregator, etc).
--
-- Ontwerp: één bank_account = één rekening (Rabobank zakelijk, PayPal
-- Business, Revolut, etc) gekoppeld aan een grootboekrekening
-- (1100/1110/1120/1130). Transacties komen erop binnen via een
-- provider-specifieke sync; daarna draait dezelfde matching-engine
-- voor alle bronnen.

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  -- Welke ledger-rekening krijgt de boekingen
  account_code TEXT NOT NULL,
  -- Provider: hoe komen transacties binnen
  --   camt_upload: gebruiker uploadt CAMT.053 / MT940 bestand
  --   paypal:      PayPal Reports API
  --   gocardless:  GoCardless Bank Account Data (PSD2)
  --   manual:      gebruiker voert handmatig in
  provider TEXT NOT NULL,
  -- Display info
  display_name TEXT NOT NULL,           -- bv "Rabobank zakelijk *7821"
  iban TEXT,                            -- voor matching transactie -> account
  currency TEXT NOT NULL DEFAULT 'EUR',
  -- Provider-specifieke ID voor dedup van transacties
  external_account_id TEXT,
  -- Credentials/state opslag (PayPal client_id, GoCardless requisition_id, etc)
  credentials_json TEXT,
  -- Sync state
  last_sync_at INTEGER,
  last_sync_error TEXT,
  -- Lifecycle
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant
  ON bank_accounts(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_code
  ON bank_accounts(account_code);

-- Eén rij per transactie ("mutatie" in NL bank-jargon).
-- Status flow: unmatched -> matched | ignored
-- amount_cents: positief = bij (geld erop), negatief = af (geld eraf)
CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  -- Provider's eigen ID — voor dedup. Zelfde transactie 2x importeren
  -- mag niet leiden tot dubbele rij. Bij CAMT komt dit uit AcctSvcrRef
  -- of EndToEndId; bij PayPal is dit transaction_id.
  external_id TEXT NOT NULL,
  -- Boek-datum (aanvraag bij bank) en valutadatum (effectief)
  date TEXT NOT NULL,                   -- ISO yyyy-mm-dd, value date
  booking_date TEXT,                    -- als anders dan value date
  amount_cents INTEGER NOT NULL,        -- signed
  currency TEXT NOT NULL DEFAULT 'EUR',
  -- Tegenpartij
  counterparty_name TEXT,
  counterparty_iban TEXT,
  -- Vrije omschrijving (mededeling, end-to-end-id, factuurnummer)
  description TEXT,
  -- Originele provider-payload — voor debug en audit
  raw_json TEXT,
  -- Match-status
  status TEXT NOT NULL DEFAULT 'unmatched',  -- unmatched | matched | ignored
  -- Reden voor ignored (bv "interne overboeking", "privé")
  ignored_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (bank_account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_account_date
  ON bank_transactions(bank_account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_status
  ON bank_transactions(tenant_id, status, date DESC);

-- Match-record: koppelt een transactie aan een factuur, inkoopfactuur,
-- handmatige journaalpost, of een andere transactie (interne
-- overboeking). Eén transactie kan meerdere matches hebben (split-
-- betaling: 1 storting tegen 2 facturen).
CREATE TABLE IF NOT EXISTS bank_matches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  transaction_id TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  -- Wat wordt er gematched
  target_type TEXT NOT NULL,            -- invoice | purchase | journal_entry
  target_id TEXT NOT NULL,
  -- Bedrag van de match (voor splits = deel van transactie)
  amount_cents INTEGER NOT NULL,
  -- Welke journal_entry is geboekt om deze match te realiseren
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  -- Confidence: hoe automatisch is dit gegaan
  --   auto_high:  100% match (factuurnummer + bedrag exact)
  --   suggested:  AI/heuristiek heeft 'm voorgesteld, user bevestigd
  --   manual:     user heeft 'm volledig zelf gekozen
  confidence TEXT NOT NULL,
  matched_at INTEGER NOT NULL,
  matched_by TEXT                       -- 'system' of user-id
);

CREATE INDEX IF NOT EXISTS idx_bank_matches_tx
  ON bank_matches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_matches_target
  ON bank_matches(target_type, target_id);
