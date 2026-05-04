/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import type { Company } from "@/lib/companies";
import type { Client } from "@/lib/clients";
import type { QuoteWithLines } from "@/lib/quotes";

type Lang = "nl" | "en";

interface QuoteI18n {
  quote: string;
  quote_number: string;
  issue_date: string;
  valid_until: string;
  reference: string;
  from: string;
  to: string;
  description: string;
  quantity: string;
  unit_price: string;
  vat_rate: string;
  line_total: string;
  subtotal: string;
  vat: string;
  total: string;
  payment_terms: string;
  notes: string;
  kvk: string;
  vat_number: string;
  iban: string;
  reverse_charge_note: string;
  export_note: string;
  accept_prompt: string;
}

const NL: QuoteI18n = {
  quote: "OFFERTE",
  quote_number: "Offertenr.",
  issue_date: "Offertedatum",
  valid_until: "Geldig tot",
  reference: "Referentie",
  from: "Van",
  to: "Aan",
  description: "Omschrijving",
  quantity: "Aantal",
  unit_price: "Stukprijs",
  vat_rate: "BTW",
  line_total: "Totaal",
  subtotal: "Subtotaal",
  vat: "BTW",
  total: "Totaal",
  payment_terms: "Voorwaarden",
  notes: "Opmerkingen",
  kvk: "KvK",
  vat_number: "BTW",
  iban: "IBAN",
  reverse_charge_note:
    "Bij acceptatie: BTW verlegd (intracommunautaire levering, art. 138 EU-richtlijn).",
  export_note:
    "Bij acceptatie: export van diensten/goederen buiten de EU — 0% BTW.",
  accept_prompt:
    "Graag deze offerte getekend retour of per e-mail bevestigen.",
};

const EN: QuoteI18n = {
  quote: "QUOTE",
  quote_number: "Quote no.",
  issue_date: "Issue date",
  valid_until: "Valid until",
  reference: "Reference",
  from: "From",
  to: "For",
  description: "Description",
  quantity: "Qty",
  unit_price: "Unit price",
  vat_rate: "VAT",
  line_total: "Total",
  subtotal: "Subtotal",
  vat: "VAT",
  total: "Total",
  payment_terms: "Terms",
  notes: "Notes",
  kvk: "CoC",
  vat_number: "VAT",
  iban: "IBAN",
  reverse_charge_note:
    "Upon acceptance: VAT reverse-charged (intra-community supply, EU directive article 138).",
  export_note:
    "Upon acceptance: export of services/goods outside the EU — 0% VAT.",
  accept_prompt:
    "Please return this quote signed or confirm acceptance by email.",
};

function t(lang: Lang): QuoteI18n {
  return lang === "en" ? EN : NL;
}

const EUR = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

function fmt(cents: number): string {
  return EUR.format(cents / 100);
}

function fmtQty(milli: number): string {
  const n = milli / 1000;
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface Props {
  quote: QuoteWithLines;
  company: Company;
  client: Client;
  logoDataUrl?: string | null;
}

export function QuoteDocument({ quote, company, client, logoDataUrl }: Props) {
  const lang: Lang = quote.language === "en" ? "en" : "nl";
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

  const byRate = new Map<
    number,
    { rate: number; base: number; vat: number }
  >();
  for (const line of quote.lines) {
    const rate = quote.vat_treatment === "standard" ? line.vat_rate : 0;
    const entry = byRate.get(rate) ?? { rate, base: 0, vat: 0 };
    entry.base += line.line_total_cents;
    entry.vat += quote.vat_treatment === "standard" ? line.line_vat_cents : 0;
    byRate.set(rate, entry);
  }
  const breakdown = Array.from(byRate.values()).sort((a, b) => a.rate - b.rate);

  return (
    <Document
      title={`${quote.number} — ${company.name}`}
      author={company.name}
      subject={L.quote}
    >
      <Page size="A4" style={styles.page}>
        <View
          style={[
            styles.header,
            logoPosition === "right" ? { flexDirection: "row-reverse" } : {},
          ]}
        >
          <View
            style={
              logoPosition === "right" ? styles.headerRight : styles.headerLeft
            }
          >
            {logoDataUrl ? (
              <Image src={logoDataUrl} style={styles.logo} />
            ) : headerStyle !== "logo_only" ? (
              <Text style={styles.companyNameBig}>{company.name}</Text>
            ) : null}
          </View>
          {headerStyle !== "logo_only" && (
            <View
              style={
                logoPosition === "right"
                  ? styles.headerLeft
                  : styles.headerRight
              }
            >
              <Text style={styles.invoiceTitle}>{L.quote}</Text>
              <Text style={styles.invoiceNumber}>{quote.number}</Text>
            </View>
          )}
        </View>

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
            <MetaRow label={L.quote_number} value={quote.number} />
            <MetaRow label={L.issue_date} value={fmtDate(quote.issue_date, lang)} />
            <MetaRow label={L.valid_until} value={fmtDate(quote.valid_until_date, lang)} />
            {quote.reference && (
              <MetaRow label={L.reference} value={quote.reference} />
            )}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colDesc]}>{L.description}</Text>
          <Text style={[styles.th, styles.colQty]}>{L.quantity}</Text>
          <Text style={[styles.th, styles.colPrice]}>{L.unit_price}</Text>
          <Text style={[styles.th, styles.colVat]}>{L.vat_rate}</Text>
          <Text style={[styles.th, styles.colTotal]}>{L.line_total}</Text>
        </View>

        {quote.lines.map((line, idx) => (
          <View
            key={line.id}
            style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
            wrap={false}
          >
            <View style={styles.colDesc}>
              <Text style={styles.td}>{line.description}</Text>
            </View>
            <Text style={[styles.td, styles.colQty, styles.right]}>
              {fmtQty(line.quantity_milli)}
              {line.unit ? ` ${line.unit}` : ""}
            </Text>
            <Text style={[styles.td, styles.colPrice, styles.right]}>
              {fmt(line.unit_price_cents)}
            </Text>
            <Text style={[styles.td, styles.colVat, styles.right]}>
              {quote.vat_treatment === "standard" ? `${line.vat_rate}%` : "0%"}
            </Text>
            <Text style={[styles.td, styles.colTotal, styles.right]}>
              {fmt(line.line_total_cents)}
            </Text>
          </View>
        ))}

        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <TotalsLine label={L.subtotal} value={fmt(quote.subtotal_cents)} />
            {breakdown.map((b) => (
              <TotalsLine
                key={b.rate}
                label={`${L.vat} ${b.rate}%`}
                sublabel={fmt(b.base)}
                value={fmt(b.vat)}
              />
            ))}
            <View style={styles.totalsDivider} />
            <TotalsLine label={L.total} value={fmt(quote.total_cents)} bold />
          </View>
        </View>

        {quote.vat_treatment === "reverse_charge_eu" && (
          <Text style={styles.vatNote}>{L.reverse_charge_note}</Text>
        )}
        {quote.vat_treatment === "export_outside_eu" && (
          <Text style={styles.vatNote}>{L.export_note}</Text>
        )}

        {quote.notes && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{L.notes}</Text>
            <Text style={styles.blockText}>{quote.notes}</Text>
          </View>
        )}
        {quote.terms_text && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{L.payment_terms}</Text>
            <Text style={styles.blockText}>{quote.terms_text}</Text>
          </View>
        )}

        <View style={styles.acceptBlock}>
          <Text style={styles.acceptPrompt}>
            {quote.signature_line && quote.signature_line.trim()
              ? quote.signature_line
              : L.accept_prompt}
          </Text>
          <View style={styles.signatureRow}>
            <View style={styles.signatureCol}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>
                {lang === "en" ? "Signature" : "Handtekening"}
              </Text>
            </View>
            <View style={styles.signatureCol}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>
                {lang === "en" ? "Date" : "Datum"}
              </Text>
            </View>
          </View>
        </View>

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
function boldFor(f: string): string {
  if (f === "Times-Roman") return "Times-Bold";
  if (f === "Courier") return "Courier-Bold";
  return "Helvetica-Bold";
}
function italicFor(f: string): string {
  if (f === "Times-Roman") return "Times-Italic";
  if (f === "Courier") return "Courier-Oblique";
  return "Helvetica-Oblique";
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text style={{ fontSize: 8, color: "#6b7280", width: 70 }}>{label}</Text>
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
    partyName: { fontSize: 11, fontFamily: o.boldFont, marginBottom: 2 },
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
    acceptBlock: { marginTop: 24, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#e5e7eb" },
    acceptPrompt: { fontSize: 9, color: "#374151", marginBottom: 16 },
    signatureRow: { flexDirection: "row", gap: 24, marginTop: 8 },
    signatureCol: { flex: 1 },
    signatureLine: { borderBottomWidth: 0.5, borderBottomColor: "#9ca3af", height: 32 },
    signatureLabel: { fontSize: 7, color: "#6b7280", marginTop: 2 },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 48,
      right: 48,
      borderTopWidth: 0.5,
      borderTopColor: "#e5e7eb",
      paddingTop: 8,
    },
    footerText: { fontSize: 7, color: "#9ca3af", textAlign: "center" },
  });
}
