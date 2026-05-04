-- Aangifte-archief voor BTW-kwartalen. Eén row per (tenant, year, quarter).
-- Wordt aangevuld bij het sluiten van het kwartaal via submitVatQuarter().
-- Gebruikt voor:
--   1. Audit trail richting Belastingdienst (welke aangifte met welke
--      cijfers ingediend op welke datum)
--   2. Suppletie-rapport: wat staat er nu vs. wat is ingediend
--   3. UI-archief op /accounting/reports/vat (lijst van afgeronde Q's)

CREATE TABLE IF NOT EXISTS vat_submissions (
  tenant_id TEXT NOT NULL DEFAULT 'default',
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL,            -- 1..4
  submitted_at INTEGER NOT NULL,       -- ms epoch wanneer NielsBaars op submit drukte
  base_cents INTEGER NOT NULL,         -- som omzet-rubrieken voor referentie
  to_pay_cents INTEGER NOT NULL,       -- positief = te betalen, negatief = retour
  payment_journal_id TEXT,             -- FK naar journal_entries (afdracht-boeking)
  paid_date TEXT NOT NULL,             -- YYYY-MM-DD
  bank_account_code TEXT NOT NULL,     -- 1100/1110/etc
  PRIMARY KEY (tenant_id, year, quarter)
);

CREATE INDEX IF NOT EXISTS idx_vat_subs_tenant
  ON vat_submissions(tenant_id, year DESC, quarter DESC);
