-- Boekhoudkern: chart of accounts + double-entry journaalposten + periodes.
-- Elk debet-bedrag heeft een credit-tegenboeking; sum(debit) == sum(credit)
-- per journal_entry. Validatie wordt afgedwongen in code (post()).

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  code TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  -- Klassieke NL-categorieën:
  --   asset       (bezittingen, 1xxx)
  --   liability   (schulden, 1500/1600/1700/1900)
  --   equity      (eigen vermogen, 0xxx of 9xxx — minder gebruikt voor SMB)
  --   income      (omzet, 8xxx)
  --   expense     (kosten, 4xxx, 7xxx)
  type TEXT NOT NULL,
  -- Default BTW-tarief voor regels die deze rekening gebruiken (purchase
  -- side helpt vooral). Null = neutraal.
  default_vat_rate INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant_type
  ON chart_of_accounts(tenant_id, type);

-- Eén journal_entry = één boekhoudkundige gebeurtenis (bv. "Factuur INT-0001
-- verzonden"). Bestaat uit 2+ journal_lines die samen balanceren.
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  date TEXT NOT NULL,             -- ISO yyyy-mm-dd, datum van boeking
  description TEXT NOT NULL,
  -- Naar welke source-record verwijst deze boeking
  source_type TEXT NOT NULL,      -- invoice|purchase|bank_match|manual|opening
  source_id TEXT,
  -- Lock zodra een periode is afgesloten
  locked INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT,                -- 'system' of user-id
  reversed_by TEXT,               -- als deze entry gereverseerd is, ID van de tegenboeking
  reverses_id TEXT                -- als deze entry een reverse is, originele ID
);

CREATE INDEX IF NOT EXISTS idx_journal_tenant_date ON journal_entries(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_journal_source ON journal_entries(source_type, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  -- Verwijst naar chart_of_accounts (tenant_id wordt impliciet via parent)
  account_code TEXT NOT NULL,
  description TEXT,
  debit_cents INTEGER NOT NULL DEFAULT 0,
  credit_cents INTEGER NOT NULL DEFAULT 0,
  vat_code TEXT,                  -- bv. '21H', '9L', '0EU' — voor BTW-aangifte rapport
  -- Sub-administratie: koppel optioneel aan klant of leverancier voor
  -- per-relatie balansen.
  client_id TEXT,
  supplier_id TEXT,
  CHECK (debit_cents >= 0 AND credit_cents >= 0),
  CHECK (debit_cents = 0 OR credit_cents = 0)
);

CREATE INDEX IF NOT EXISTS idx_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_lines_account ON journal_lines(account_code);

-- Boekhoud-periodes (typisch maand); 'closed' = locked, geen nieuwe
-- boekingen in die periode.
CREATE TABLE IF NOT EXISTS accounting_periods (
  tenant_id TEXT NOT NULL DEFAULT 'default',
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,         -- 1..12
  status TEXT NOT NULL DEFAULT 'open',  -- open|closed
  closed_at INTEGER,
  closed_by TEXT,
  PRIMARY KEY (tenant_id, year, month)
);
