-- Vaste activa register + afschrijvingen.
--
-- Wat we modelleren:
--   - Een 'asset' is een investering > €450 die fiscaal moet worden
--     geactiveerd ipv direct als kosten geboekt (laptop, machine,
--     inventaris, software-licentie meerjarig, etc).
--   - Lineaire afschrijving over useful_life_years (3-10 jaar typisch),
--     restwaarde optioneel.
--   - Maandelijkse boeking: Debet 4350 Afschrijving / Credit 05xx Cum.
--     afschrijving. Boekwaarde = aanschaf - cumulatieve afschrijving.
--   - Bij verkoop/sloop: disposal flow boekt boekwaarde af + verlies/
--     winst op buitengewone bate/last.
--
-- Niet in scope nu:
--   - Degressieve / annuiteit afschrijving (alleen lineair voor MKB)
--   - Versnelde afschrijving (KIA/MIA/EIA - kunnen via correctie-boeking)
--   - Component-afschrijving (gebouw met installaties apart afschrijven)
--   - Herwaarderingen

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  -- Eigen code (uniek per tenant) bv ASSET-2026-001 of LAPTOP-NB-01
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,             -- 'inventaris' | 'machines' | 'voertuigen' | 'ict' | 'overig'
  -- Aanschaf
  purchase_date TEXT NOT NULL,        -- ISO date
  purchase_amount_cents INTEGER NOT NULL CHECK (purchase_amount_cents > 0),
  -- Optionele FK naar inkoopfactuur waar deze uit komt
  purchase_invoice_id TEXT REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  -- Levensduur + restwaarde
  useful_life_years REAL NOT NULL CHECK (useful_life_years > 0),
  residual_value_cents INTEGER NOT NULL DEFAULT 0,
  -- Methode: nu alleen 'linear', schema-veld voor toekomst
  method TEXT NOT NULL DEFAULT 'linear',
  -- Grootboekrekeningen voor de boekingen — defaults uit company COA
  asset_account_code TEXT NOT NULL,             -- bv 0500 Inventaris
  depreciation_account_code TEXT NOT NULL,      -- bv 0501 Cumulatieve afschrijving
  expense_account_code TEXT NOT NULL,           -- bv 4350 Afschrijvingskosten
  -- Status
  status TEXT NOT NULL DEFAULT 'active',         -- 'active' | 'fully_depreciated' | 'disposed'
  disposed_date TEXT,
  disposal_amount_cents INTEGER,                -- verkoopopbrengst, negatief = verlies bij sloop
  -- Audit
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_company ON assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_purchase_inv ON assets(purchase_invoice_id);

-- Per geboekte maand-afschrijving 1 row. Idempotent: (asset_id, year, month)
-- is uniek dus dubbel boeken kan niet.
CREATE TABLE IF NOT EXISTS asset_depreciations (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,        -- 1..12
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  journal_entry_id TEXT,                -- FK naar journal_entries.id (NIET hard FK voor cascade-vrijheid)
  posted_at INTEGER NOT NULL,
  UNIQUE (asset_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_asset_depr_asset ON asset_depreciations(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_depr_period
  ON asset_depreciations(period_year, period_month);
