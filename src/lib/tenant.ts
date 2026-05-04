/**
 * Tenant-context.
 *
 * Single-tenant modus (huidig): alle data leeft onder tenant_id = "default".
 * SaaS-modus (later): tenant wordt gederiveerd uit de ingelogde sessie en/of
 * de hostnaam van de request. De rest van de code praat alleen met
 * `getCurrentTenantId()` / `getTenant()` zodat de migratie schoon is.
 */

import { getDb } from "@/lib/db";

export const DEFAULT_TENANT_ID = "default";

export interface Tenant {
  id: string;
  name: string;
  app_name: string | null;
  accent_color: string | null;
  accounting_url: string | null;
  logo_path: string | null;
  owner_user_id: string | null;
  status: string;
  plan: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Returnt de huidige tenant-id. In single-tenant mode altijd 'default'.
 * Bij SaaS-uitbreiding wordt dit `request.session.tenant_id` of een
 * resolver op basis van host (`{slug}.accounting.example.com`).
 */
export function getCurrentTenantId(): string {
  return DEFAULT_TENANT_ID;
}

export function getTenant(id: string): Tenant | null {
  const row = getDb()
    .prepare("SELECT * FROM tenants WHERE id = ?")
    .get(id) as Tenant | undefined;
  return row ?? null;
}

export function getCurrentTenant(): Tenant {
  const t = getTenant(getCurrentTenantId());
  if (!t) {
    // Defensive: tenant ontbreekt → zaai default opnieuw, dit hoort
    // alleen te kunnen gebeuren als migratie 013 niet is gedraaid.
    const now = Date.now();
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO tenants (id, name, status, created_at, updated_at)
         VALUES ('default', 'Default', 'active', ?, ?)`,
      )
      .run(now, now);
    return getTenant(DEFAULT_TENANT_ID)!;
  }
  return t;
}
