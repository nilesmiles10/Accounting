import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface IcpRow {
  client_id: string;
  client_name: string;
  vat_number: string;
  country_code: string;       // ISO-2, geleid uit BTW-nummer (bv NL, DE, FR)
  total_cents: number;        // grondslag (geen BTW want verlegd)
  service_or_goods: "G" | "D"; // Goederen of Diensten — voor nu altijd D (services)
}

export interface IcpReport {
  from: string;
  to: string;
  rows: IcpRow[];
  total_cents: number;
}

/**
 * ICP-opgave (Intracommunautaire Prestaties): per kwartaal verplicht
 * naast de gewone BTW-aangifte voor leveringen aan EU-ondernemers met
 * verlegde BTW (vat_treatment=reverse_charge_eu).
 *
 * Vorm: per klant 1 regel met BTW-nummer + landcode + bedrag (excl BTW).
 * Wordt apart ingediend op Mijn Belastingdienst Zakelijk → ICP-opgave.
 *
 * Bron: invoices waar vat_treatment='reverse_charge_eu' en
 * status IN (sent/paid/overdue) en is_credit_note=0; creditnota's
 * voor reverse-charge tellen mee als negatief omdat we
 * sum(total_cents * sign) doen — TODO: aparte regel op ICP voor
 * creditnota's? Belastingdienst staat negatieve regels toe binnen een
 * tijdvak.
 *
 * Landcode-extractie: eerste 2 letters van vat_number (NL123, DE456,
 * FR789). Onbetrouwbare nummers worden gemarkeerd in UI.
 */
export function generateIcpReport(from: string, to: string): IcpReport {
  const db = getDb();
  const tenantId = getCurrentTenantId();

  const rows = db
    .prepare(
      `SELECT i.client_id,
              c.name AS client_name,
              c.vat_number,
              SUM(
                CASE WHEN i.is_credit_note = 1
                  THEN -i.subtotal_cents
                  ELSE i.subtotal_cents
                END
              ) AS total_cents
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.tenant_id = ?
         AND i.vat_treatment = 'reverse_charge_eu'
         AND i.status IN ('sent', 'paid', 'overdue')
         AND i.issue_date BETWEEN ? AND ?
       GROUP BY i.client_id, c.name, c.vat_number
       HAVING total_cents != 0
       ORDER BY total_cents DESC`,
    )
    .all(tenantId, from, to) as Array<{
    client_id: string;
    client_name: string;
    vat_number: string | null;
    total_cents: number;
  }>;

  const result: IcpRow[] = rows.map((r) => {
    const vat = (r.vat_number || "").replace(/\s/g, "").toUpperCase();
    const countryCode = vat.slice(0, 2);
    return {
      client_id: r.client_id,
      client_name: r.client_name,
      vat_number: vat,
      country_code: countryCode,
      total_cents: r.total_cents,
      service_or_goods: "D",
    };
  });

  return {
    from,
    to,
    rows: result,
    total_cents: result.reduce((s, r) => s + r.total_cents, 0),
  };
}
