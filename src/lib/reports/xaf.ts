import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCompany } from "@/lib/companies";

/**
 * XAF (XML Auditfile Financieel) versie 3.2 generator.
 *
 * Spec: https://www.softwarepakketten.nl/keurmerken/xaf/index.php
 * Schema: http://www.auditfiles.nl/XAF/3.2
 *
 * Wat we exporteren per fiscaal jaar:
 *   - <header>: bedrijfsgegevens + periode
 *   - <company>: KvK, BTW, adres, COA, klanten, leveranciers
 *   - <transactions>: alle journal_entries als <transaction> met <trLine>
 *
 * Belastingdienst-controleurs importeren dit in hun audit-software
 * (SmartXLS, IDEA) om je boekhouding na te lopen. Sinds 2014 bij elke
 * controle gevraagd.
 *
 * Niet 100% feature-volledig: omdat we 1 BTW-tarief per regel hebben
 * laten we sub-rubrieken weg; auditor kan ze afleiden uit account-codes.
 * Cost centers / projecten doen we niet (geen schema voor).
 */

interface CompanyRow {
  id: string;
  name: string;
  kvk: string | null;
  vat_number: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  vat_number: string | null;
  email: string | null;
}

interface SupplierRow {
  id: string;
  name: string;
  vat_number: string | null;
  email: string | null;
}

interface AccountRow {
  code: string;
  name: string;
  type: string;
}

interface JournalEntryRow {
  id: string;
  date: string;
  description: string;
  source_type: string;
  source_id: string | null;
}

interface JournalLineRow {
  id: string;
  journal_entry_id: string;
  account_code: string;
  description: string | null;
  debit_cents: number;
  credit_cents: number;
  vat_code: string | null;
  client_id: string | null;
  supplier_id: string | null;
}

function escapeXml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtMoney(cents: number): string {
  // XAF wil decimal met punt, 2 decimals
  return (cents / 100).toFixed(2);
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 19);
}

function mapAccountType(type: string): string {
  // XAF 3.2 leadCode types: B=Balance, P=P&L, M=Memorial
  switch (type) {
    case "asset":
    case "liability":
    case "equity":
      return "B";
    case "income":
    case "expense":
      return "P";
    default:
      return "M";
  }
}

/**
 * Genereer XAF 3.2 string voor 1 fiscaal jaar.
 *
 * @param year fiscaal jaar (bv 2026)
 * @param companyId optioneel — als gegeven, alleen boekingen voor dat
 *   bedrijf. Anders hele tenant.
 */
export function generateXaf(year: number, companyId?: string): string {
  const db = getDb();
  const tenantId = getCurrentTenantId();
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-12-31`;

  // Pak het bedrijf voor header — als tenant maar 1 bedrijf heeft of
  // companyId is opgegeven, gebruik dat.
  const company = companyId
    ? getCompany(companyId)
    : (db
        .prepare("SELECT * FROM companies WHERE tenant_id = ? LIMIT 1")
        .get(tenantId) as CompanyRow | undefined) || null;

  if (!company) {
    throw new Error(
      "Geen bedrijfsgegevens gevonden — kan XAF niet genereren",
    );
  }

  // COA
  const accounts = db
    .prepare(
      `SELECT code, name, type FROM chart_of_accounts
       WHERE tenant_id = ?
       ORDER BY code`,
    )
    .all(tenantId) as AccountRow[];

  // Klanten + leveranciers (alleen die met activiteit in periode helpt
  // grootte beperken, maar Belastingdienst wil compleet — full export)
  const clients = db
    .prepare(
      `SELECT id, name, vat_number, email FROM clients
       WHERE tenant_id = ? ORDER BY name`,
    )
    .all(tenantId) as ClientRow[];

  const suppliers = db
    .prepare(
      `SELECT id, name, vat_number, email FROM suppliers
       WHERE tenant_id = ? ORDER BY name`,
    )
    .all(tenantId) as SupplierRow[];

  // Journal entries + lines binnen periode + optioneel filter op company
  const entryWhere: string[] = [
    "tenant_id = ?",
    "date BETWEEN ? AND ?",
  ];
  const entryParams: unknown[] = [tenantId, periodStart, periodEnd];
  if (companyId) {
    entryWhere.push("company_id = ?");
    entryParams.push(companyId);
  }
  const entries = db
    .prepare(
      `SELECT id, date, description, source_type, source_id
       FROM journal_entries
       WHERE ${entryWhere.join(" AND ")}
       ORDER BY date ASC, created_at ASC`,
    )
    .all(...entryParams) as JournalEntryRow[];

  const entryIds = entries.map((e) => e.id);
  const lines: JournalLineRow[] =
    entryIds.length === 0
      ? []
      : (db
          .prepare(
            `SELECT id, journal_entry_id, account_code, description,
                    debit_cents, credit_cents, vat_code, client_id, supplier_id
             FROM journal_lines
             WHERE journal_entry_id IN (${entryIds.map(() => "?").join(",")})
             ORDER BY id ASC`,
          )
          .all(...entryIds) as JournalLineRow[]);

  const linesByEntry = new Map<string, JournalLineRow[]>();
  for (const l of lines) {
    const arr = linesByEntry.get(l.journal_entry_id) || [];
    arr.push(l);
    linesByEntry.set(l.journal_entry_id, arr);
  }

  // Totalen voor <header> verification
  const totalDebit = lines.reduce((s, l) => s + l.debit_cents, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_cents, 0);

  // Group entries per maand voor <journal> + <transaction> structuur
  const journalsByMonth = new Map<string, JournalEntryRow[]>();
  for (const e of entries) {
    const m = e.date.slice(0, 7); // YYYY-MM
    const arr = journalsByMonth.get(m) || [];
    arr.push(e);
    journalsByMonth.set(m, arr);
  }

  // ─── XML opbouwen ───────────────────────────────────────────────────────
  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push(
    '<auditfile xmlns="http://www.auditfiles.nl/XAF/3.2">',
  );

  // Header
  xml.push("  <header>");
  xml.push(`    <fiscalYear>${year}</fiscalYear>`);
  xml.push(`    <startDate>${periodStart}</startDate>`);
  xml.push(`    <endDate>${periodEnd}</endDate>`);
  xml.push(`    <curCode>EUR</curCode>`);
  xml.push(`    <dateCreated>${nowIso()}</dateCreated>`);
  xml.push(`    <softwareDesc>Nova Control Accounting</softwareDesc>`);
  xml.push(`    <softwareVersion>1.0</softwareVersion>`);
  xml.push("  </header>");

  // Company
  xml.push("  <company>");
  xml.push(`    <companyIdent>${escapeXml(company.id)}</companyIdent>`);
  xml.push(`    <companyName>${escapeXml(company.name)}</companyName>`);
  xml.push(
    `    <taxRegistrationCountry>${escapeXml(company.country || "NL")}</taxRegistrationCountry>`,
  );
  xml.push(
    `    <taxRegIdent>${escapeXml(company.vat_number || "")}</taxRegIdent>`,
  );
  if (company.kvk) {
    xml.push(
      `    <streetAddress>`,
      `      <country>${escapeXml(company.country || "NL")}</country>`,
      ...(company.address_line1
        ? [`      <streetname>${escapeXml(company.address_line1)}</streetname>`]
        : []),
      ...(company.postal_code
        ? [`      <postalCode>${escapeXml(company.postal_code)}</postalCode>`]
        : []),
      ...(company.city
        ? [`      <city>${escapeXml(company.city)}</city>`]
        : []),
      `    </streetAddress>`,
    );
  }

  // Chart of accounts
  xml.push("    <generalLedger>");
  for (const a of accounts) {
    xml.push("      <ledgerAccount>");
    xml.push(`        <accID>${escapeXml(a.code)}</accID>`);
    xml.push(`        <accDesc>${escapeXml(a.name)}</accDesc>`);
    xml.push(`        <accTp>${mapAccountType(a.type)}</accTp>`);
    xml.push(`        <leadCode>${escapeXml(a.code)}</leadCode>`);
    xml.push("      </ledgerAccount>");
  }
  xml.push("    </generalLedger>");

  // Customers
  xml.push("    <customersSuppliers>");
  for (const c of clients) {
    xml.push("      <customer>");
    xml.push(`        <custID>${escapeXml(c.id)}</custID>`);
    xml.push(`        <custName>${escapeXml(c.name)}</custName>`);
    if (c.vat_number) {
      xml.push(`        <taxRegIdent>${escapeXml(c.vat_number)}</taxRegIdent>`);
    }
    if (c.email) {
      xml.push(`        <contact><email>${escapeXml(c.email)}</email></contact>`);
    }
    xml.push("      </customer>");
  }
  for (const s of suppliers) {
    xml.push("      <supplier>");
    xml.push(`        <suppID>${escapeXml(s.id)}</suppID>`);
    xml.push(`        <suppName>${escapeXml(s.name)}</suppName>`);
    if (s.vat_number) {
      xml.push(`        <taxRegIdent>${escapeXml(s.vat_number)}</taxRegIdent>`);
    }
    if (s.email) {
      xml.push(`        <contact><email>${escapeXml(s.email)}</email></contact>`);
    }
    xml.push("      </supplier>");
  }
  xml.push("    </customersSuppliers>");

  // Transactions — per periode (maand) één <journal>
  xml.push("    <transactions>");
  xml.push(`      <linesCount>${lines.length}</linesCount>`);
  xml.push(`      <totalDebit>${fmtMoney(totalDebit)}</totalDebit>`);
  xml.push(`      <totalCredit>${fmtMoney(totalCredit)}</totalCredit>`);

  // Iterate periodes
  const periods = Array.from(journalsByMonth.keys()).sort();
  for (const p of periods) {
    const periodEntries = journalsByMonth.get(p)!;
    xml.push("      <journal>");
    xml.push(`        <jrnID>MEMO-${p}</jrnID>`);
    xml.push(`        <desc>Boekingen ${p}</desc>`);
    xml.push(`        <jrnTp>M</jrnTp>`);

    for (const e of periodEntries) {
      const elines = linesByEntry.get(e.id) || [];
      xml.push("        <transaction>");
      xml.push(`          <nr>${escapeXml(e.id.slice(0, 12))}</nr>`);
      xml.push(`          <desc>${escapeXml(e.description)}</desc>`);
      xml.push(`          <periodNumber>${parseInt(p.slice(5))}</periodNumber>`);
      xml.push(`          <trDt>${e.date}</trDt>`);

      for (const l of elines) {
        xml.push("          <trLine>");
        xml.push(`            <nr>${escapeXml(l.id.slice(0, 12))}</nr>`);
        xml.push(`            <accID>${escapeXml(l.account_code)}</accID>`);
        if (l.client_id) {
          xml.push(`            <custID>${escapeXml(l.client_id)}</custID>`);
        } else if (l.supplier_id) {
          xml.push(`            <suppID>${escapeXml(l.supplier_id)}</suppID>`);
        }
        if (l.description) {
          xml.push(`            <desc>${escapeXml(l.description)}</desc>`);
        }
        if (l.debit_cents > 0) {
          xml.push(`            <amnt>${fmtMoney(l.debit_cents)}</amnt>`);
          xml.push(`            <amntDbCr>D</amntDbCr>`);
        } else {
          xml.push(`            <amnt>${fmtMoney(l.credit_cents)}</amnt>`);
          xml.push(`            <amntDbCr>C</amntDbCr>`);
        }
        if (l.vat_code) {
          xml.push(`            <vatCode>${escapeXml(l.vat_code)}</vatCode>`);
        }
        xml.push(`            <effDate>${e.date}</effDate>`);
        xml.push("          </trLine>");
      }
      xml.push("        </transaction>");
    }
    xml.push("      </journal>");
  }
  xml.push("    </transactions>");

  xml.push("  </company>");
  xml.push("</auditfile>");

  return xml.join("\n");
}
