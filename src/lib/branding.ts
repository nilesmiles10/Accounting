/**
 * Branding-laag.
 *
 * Single bron-van-waarheid voor app-naam, accent-kleur, base-URL en logo.
 * Volgorde van precedence:
 *   1. Tenant override (tenants tabel, leeg = skip)
 *   2. Env-var (NEXT_PUBLIC_*)
 *   3. Hardcoded default
 *
 * In SaaS: de tenant override is leidend zodat elke klant z'n eigen
 * branding kan instellen.
 */

import { getCurrentTenant } from "@/lib/tenant";

export interface Branding {
  appName: string;
  accentColor: string;
  accountingUrl: string;
  logoPath: string | null;
}

const DEFAULT_APP_NAME = "Nova Accounting";
const DEFAULT_ACCENT = "#10b981";
const DEFAULT_URL = "https://accounting.novactrl.nl";

/**
 * Server-side branding ophaler. Lees nooit `process.env` of de
 * tenants-tabel rechtstreeks vanuit feature-code; gebruik altijd deze
 * helper zodat SaaS-overrides automatisch werken.
 */
export function getBranding(): Branding {
  const tenant = getCurrentTenant();
  return {
    appName:
      tenant.app_name ||
      process.env.NEXT_PUBLIC_APP_NAME ||
      DEFAULT_APP_NAME,
    accentColor:
      tenant.accent_color ||
      process.env.NEXT_PUBLIC_ACCENT_COLOR ||
      DEFAULT_ACCENT,
    accountingUrl:
      tenant.accounting_url ||
      process.env.NEXT_PUBLIC_ACCOUNTING_URL ||
      DEFAULT_URL,
    logoPath: tenant.logo_path,
  };
}

/** Convenience — vaak alleen base-URL nodig in email/PDF/Mollie callbacks. */
export function getAccountingBaseUrl(): string {
  return getBranding().accountingUrl;
}
