-- Tenant-laag: in single-tenant modus (huidig) is er één tenant met id 'default'.
-- Bij SaaS-uitbreiding krijgt elke klant een eigen tenant; alle bestaande
-- queries blijven werken doordat tenant_id default 'default' krijgt.

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Branding per tenant — leeg = env-default
  app_name TEXT,
  accent_color TEXT,
  accounting_url TEXT,
  logo_path TEXT,
  -- SaaS-future: koppeling naar user-account die deze tenant bezit
  owner_user_id TEXT,
  -- Voor SaaS: status/plan/billing
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Default tenant — voor jouw single-user installatie.
INSERT OR IGNORE INTO tenants (id, name, status, created_at, updated_at)
VALUES ('default', 'Default', 'active', strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- Top-level user-data tabellen krijgen tenant_id. Geen FK in SQLite-ALTER
-- (kan niet); we relyen op de helper in tenant.ts om consistent te zijn.

ALTER TABLE companies ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE clients   ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE invoices  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE quotes    ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE items     ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE settings  ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_items_tenant ON items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id);
