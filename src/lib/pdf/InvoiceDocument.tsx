/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";
import type { Company } from "@/lib/companies";
import type { Client } from "@/lib/clients";
import type { InvoiceWithLines } from "@/lib/invoices";
import { t, type Lang } from "./i18n";

// Fonts: rely on react-pdf's built-in Helvetica to avoid network fetches.
// If we later want a nicer font, register a TTF here via Font.register().
Font.registerHyphenationCallback((word) => [word]);

const EUR = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatEUR(cents: number): string {
  return EUR.format(cents / 100);
}

function formatQty(milli: number): string {
  const n = milli / 1000;
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface Props {
  invoice: InvoiceWithLines;
  company: Company;
  client: Client;
  logoDataUrl?: string | null;
}

export function InvoiceDocument({
  invoice,
  company,
  client,
  logoDataUrl,
}: Props) {
  const lang: Lang = invoice.language === "en" ? "en" : "nl";
  const L = t(lang);
  const accent = company.accent_color || "#6366f1";
  const font = isSupportedFont(company.font_family)
    ? company.font_family
    : "Helvetica";
  const boldFont = boldFor(font);
  const italicFont = italicFor(font);
  const headerStyle = company.header_style || "band";
  const tableStyle = company.table_header_style || "accent";
  const logoPosition = company.logo_position || "left";
  const logoMaxHeight = company.logo_max_height || 60;
  const styles = makeStyles(accent, {
    font,
    boldFont,
    italicFont,
    headerStyle,
    tableStyle,
    logoMaxHeight,
  });

  const footerText =
    company.footer_text && company.footer_text.trim()
      ? company.footer_text
      : company.show_footer_auto
        ? [
            company.name,
            company.kvk ? `${L.kvk} ${company.kvk}` : null,
            company.vat_number ? `${L.vat_number} ${company.vat_number}` : null,
            company.iban ? `${L.iban} ${company.iban}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;

  // Breakdown per rate (effective — driven by invoice treatment)
  const byRate = new Map<
    number,
    { rate: number; base: number; vat: number }
  >();
  for (const line of invoice.lines) {
    const rate =
      invoice.vat_treatment === "standard" ? line.vat_rate : 0;
    const entry = byRate.get(rate) ?? { rate, base: 0, vat: 0 };
    entry.base += line.line_total_cents;
    entry.vat +=
      invoice.vat_treatment === "standard" ? line.line_vat_cents : 0;
    byRate.set(rate, entry);
  }
  const breakdown = Array.from(byRate.values()).sort(
    (a, b) => a.rate - b.rate,
  );

  return (
    <Document
      title={`${invoice.number} — ${company.name}`}
      author={company.name}
      subject={invoice.is_credit_note === 1 ? L.credit_note : L.invoice}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View
          style={[
            styles.header,
            logoPosition === "right" ? { flexDirection: "row-reverse" } : {},
          ]}
        >
          <View style={logoPosition === "right" ? styles.headerRight : styles.headerLeft}>
            {logoDataUrl ? (
              <Image src={logoDataUrl} style={styles.logo} />
            ) : headerStyle !== "logo_only" ? (
              <Text style={styles.companyNameBig}>{company.name}</Text>
            ) : null}
          </View>
          {headerStyle !== "logo_only" && (
            <View style={logoPosition === "right" ? styles.headerLeft : styles.headerRight}>
              <Text style={styles.invoiceTitle}>
                {invoice.is_credit_note === 1 ? L.credit_note : L.invoice}
              </Text>
              <Text style={styles.invoiceNumber}>{invoice.number}</Text>
            </View>
          )}
        </View>

        {/* Parties + meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>{L.from}</Text>
            <Text style={styles.partyName}>{company.name}</Text>
            {company.legal_name && company.legal_name !== company.name && (
              <Text style={styles.partyLine}>{company.legal_name}</Text>
            )}
            {company.address_line1 && (
              <Text style={styles.partyLine}>{company.address_line1}</Text>
            )}
            {company.address_line2 && (
              <Text style={styles.partyLine}>{company.address_line2}</Text>
            )}
            {(company.postal_code || company.city) && (
              <Text style={styles.partyLine}>
                {[company.postal_code, company.city].filter(Boolean).join(" ")}
              </Text>
            )}
            {company.country && (
              <Text style={styles.partyLine}>{company.country}</Text>
            )}
            {company.email && (
              <Text style={styles.partyLine}>{company.email}</Text>
            )}
          </View>

          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>{L.to}</Text>
            <Text style={styles.partyName}>{client.name}</Text>
            {client.contact_name && (
              <Text style={styles.partyLine}>{client.contact_name}</Text>
            )}
            {client.address_line1 && (
              <Text style={styles.partyLine}>{client.address_line1}</Text>
            )}
            {client.address_line2 && (
              <Text style={styles.partyLine}>{client.address_line2}</Text>
            )}
            {(client.postal_code || client.city) && (
              <Text style={styles.partyLine}>
                {[client.postal_code, client.city].filter(Boolean).join(" ")}
              </Text>
            )}
            {client.country && (
              <Text style={styles.partyLine}>{client.country}</Text>
            )}
            {client.vat_number && (
              <Text style={styles.partyLine}>
                {L.vat_number}: {client.vat_number}
              </Text>
            )}
          </View>

          <View style={styles.metaColRight}>
            <MetaRow label={L.invoice_number} value={invoice.number} />
            <MetaRow
              label={L.issue_date}
              value={formatDate(invoice.issue_date, lang)}
            />
            <MetaRow
              label={L.due_date}
              value={formatDate(invoice.due_date, lang)}
            />
            {invoice.reference && (
              <MetaRow label={L.reference} value={invoice.reference} />
            )}
          </View>
        </View>

        {/* Lines table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colDesc]}>{L.description}</Text>
          <Text style={[styles.th, styles.colQty]}>{L.quantity}</Text>
          <Text style={[styles.th, styles.colPrice]}>{L.unit_price}</Text>
          <Text style={[styles.th, styles.colVat]}>{L.vat_rate}</Text>
          <Text style={[styles.th, styles.colTotal]}>{L.line_total}</Text>
        </View>

        {invoice.lines.map((line, idx) => (
          <View
            key={line.id}
            style={[
              styles.tableRow,
              idx % 2 === 1 ? styles.tableRowAlt : {},
            ]}
            wrap={false}
          >
            <View style={styles.colDesc}>
              <Text style={styles.td}>{line.description}</Text>
            </View>
            <Text style={[styles.td, styles.colQty, styles.right]}>
              {formatQty(line.quantity_milli)}
              {line.unit ? ` ${line.unit}` : ""}
            </Text>
            <Text style={[styles.td, styles.colPrice, styles.right]}>
              {formatEUR(line.unit_price_cents)}
            </Text>
            <Text style={[styles.td, styles.colVat, styles.right]}>
              {invoice.vat_treatment === "standard" ? `${line.vat_rate}%` : "0%"}
            </Text>
            <Text style={[styles.td, styles.colTotal, styles.right]}>
              {formatEUR(line.line_total_cents)}
            </Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <TotalsLine
              label={L.subtotal}
              value={formatEUR(invoice.subtotal_cents)}
            />
            {breakdown.map((b) => (
              <TotalsLine
                key={b.rate}
                label={`${L.vat} ${b.rate}%`}
                sublabel={`${formatEUR(b.base)}`}
                value={formatEUR(b.vat)}
              />
            ))}
            <View style={styles.totalsDivider} />
            <TotalsLine
              label={L.total}
              value={formatEUR(invoice.total_cents)}
              bold
            />
          </View>
        </View>

        {invoice.vat_treatment === "reverse_charge_eu" && (
          <Text style={styles.vatNote}>{L.reverse_charge_note}</Text>
        )}
        {invoice.vat_treatment === "export_outside_eu" && (
          <Text style={styles.vatNote}>{L.export_note}</Text>
        )}

        {invoice.notes && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{L.notes}</Text>
            <Text style={styles.blockText}>{invoice.notes}</Text>
          </View>
        )}
        {invoice.terms_text && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{L.payment_terms}</Text>
            <Text style={styles.blockText}>{invoice.terms_text}</Text>
          </View>
        )}

        {/* Footer */}
        {footerText && (
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>{footerText}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

function isSupportedFont(f: string | undefined): boolean {
  return f === "Helvetica" || f === "Times-Roman" || f === "Courier";
}

function boldFor(font: string): string {
  if (font === "Times-Roman") return "Times-Bold";
  if (font === "Courier") return "Courier-Bold";
  return "Helvetica-Bold";
}

function italicFor(font: string): string {
  if (font === "Times-Roman") return "Times-Italic";
  if (font === "Courier") return "Courier-Oblique";
  return "Helvetica-Oblique";
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text style={{ fontSize: 8, color: "#6b7280", width: 70 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 9, color: "#111827" }}>{value}</Text>
    </View>
  );
}

function TotalsLine({
  label,
  sublabel,
  value,
  bold,
}: {
  label: string;
  sublabel?: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginVertical: 2,
      }}
    >
      <View>
        <Text
          style={{
            fontSize: bold ? 11 : 9,
            color: bold ? "#111827" : "#374151",
            fontFamily: bold ? "Helvetica-Bold" : "Helvetica",
          }}
        >
          {label}
        </Text>
        {sublabel && (
          <Text style={{ fontSize: 7, color: "#9ca3af" }}>{sublabel}</Text>
        )}
      </View>
      <Text
        style={{
          fontSize: bold ? 11 : 9,
          color: "#111827",
          fontFamily: bold ? "Helvetica-Bold" : "Helvetica",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

interface StyleOpts {
  font: string;
  boldFont: string;
  italicFont: string;
  headerStyle: string;
  tableStyle: string;
  logoMaxHeight: number;
}

function makeStyles(accent: string, o: StyleOpts) {
  const headerBand = o.headerStyle === "band";
  const tableBg =
    o.tableStyle === "accent"
      ? accent
      : o.tableStyle === "dark"
        ? "#111827"
        : "#f3f4f6";
  const tableFg = o.tableStyle === "minimal" ? "#6b7280" : "#ffffff";

  return StyleSheet.create({
    page: {
      padding: 48,
      fontSize: 10,
      fontFamily: o.font,
      color: "#111827",
      paddingBottom: 64,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 32,
      borderBottomWidth: headerBand ? 2 : 0,
      borderBottomColor: accent,
      paddingBottom: 16,
    },
    headerLeft: { flex: 1 },
    headerRight: { alignItems: "flex-end", flex: 1 },
    logo: { maxWidth: 200, maxHeight: o.logoMaxHeight, objectFit: "contain" },
    companyNameBig: {
      fontSize: 18,
      fontFamily: o.boldFont,
      color: accent,
    },
    invoiceTitle: {
      fontSize: 22,
      fontFamily: o.boldFont,
      color: accent,
      letterSpacing: 2,
    },
    invoiceNumber: {
      fontSize: 11,
      color: "#374151",
      marginTop: 4,
      fontFamily: o.boldFont,
    },
    metaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
      gap: 16,
    },
    metaCol: { flex: 1 },
    metaColRight: { flex: 1, alignItems: "flex-end" },
    metaLabel: {
      fontSize: 8,
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 4,
    },
    partyName: {
      fontSize: 11,
      fontFamily: o.boldFont,
      marginBottom: 2,
    },
    partyLine: { fontSize: 9, color: "#374151", lineHeight: 1.4 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: tableBg,
      paddingVertical: 6,
      paddingHorizontal: 4,
      marginTop: 8,
      borderBottomWidth: o.tableStyle === "minimal" ? 1 : 0,
      borderBottomColor: "#d1d5db",
    },
    th: {
      fontSize: 8,
      color: tableFg,
      fontFamily: o.boldFont,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: "#e5e7eb",
    },
    tableRowAlt: { backgroundColor: "#fafafa" },
    td: { fontSize: 9, color: "#111827" },
    right: { textAlign: "right" },
    colDesc: { flex: 3, paddingRight: 8 },
    colQty: { width: 60, textAlign: "right" },
    colPrice: { width: 70, textAlign: "right" },
    colVat: { width: 40, textAlign: "right" },
    colTotal: { width: 80, textAlign: "right" },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 12,
    },
    totalsBox: { width: 220 },
    totalsDivider: {
      borderTopWidth: 1,
      borderTopColor: "#d1d5db",
      marginTop: 4,
      paddingTop: 4,
    },
    vatNote: {
      fontSize: 8,
      fontFamily: o.italicFont,
      color: "#6b7280",
      marginTop: 16,
      padding: 8,
      backgroundColor: "#f9fafb",
    },
    block: { marginTop: 16 },
    blockLabel: {
      fontSize: 8,
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 4,
    },
    blockText: { fontSize: 9, color: "#374151", lineHeight: 1.5 },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 48,
      right: 48,
      borderTopWidth: 0.5,
      borderTopColor: "#e5e7eb",
      paddingTop: 8,
    },
    footerText: {
      fontSize: 7,
      color: "#9ca3af",
      textAlign: "center",
    },
  });
}
