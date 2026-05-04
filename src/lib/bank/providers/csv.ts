/**
 * Bank-CSV parser. Detecteert kolomnamen uit de header-rij en mapt
 * Nederlandse / Engelse varianten naar de canonieke velden. Werkt voor:
 *   - Rabobank "CSV" download (semikolon, 25+ kolommen, NL headers)
 *   - ING "CSV" download (semikolon, NL headers)
 *   - ABN AMRO "TXT" download (tab-separated, ANDERE structuur — niet
 *     ondersteund voor nu, ABN-users kunnen XML downloaden)
 *   - Generic CSV met kolomnamen Date / Amount / Description
 *
 * Wat we niet doen:
 *   - Multiline cells (zelden in bank-exports)
 *   - Geneste quotes binnen quoted strings (komt nooit voor in
 *     transactie-omschrijvingen)
 */

import type { CamtTransaction } from "./camt";

/** Probeer separator te detecteren: semikolon (RABO/ING), tab (ABN), komma. */
function detectSeparator(headerLine: string): string {
  if (headerLine.includes(";")) return ";";
  if (headerLine.includes("\t")) return "\t";
  return ",";
}

/** Quote-aware CSV-row parser. */
function parseRow(row: string, sep: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inQuotes) {
      if (c === '"') {
        if (row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === sep) {
        out.push(current);
        current = "";
      } else {
        current += c;
      }
    }
  }
  out.push(current);
  return out.map((s) => s.trim());
}

/** Map header-string naar canonical field key. Case-insensitive. */
function classifyHeader(h: string): string | null {
  const k = h
    .toLowerCase()
    .replace(/[._-]/g, "")
    .replace(/\s+/g, "");

  // Datum
  if (k === "datum" || k === "date" || k === "transactiedatum") return "date";
  if (k === "rentedatum" || k === "valutadatum") return "value_date";
  if (k === "boekdatum") return "booking_date";

  // Bedrag — cruciaal: "bedrag" alleen, of bedrag eur, of amount
  if (k === "bedrag" || k === "amount" || k === "bedrageur" || k === "transactiebedrag")
    return "amount";
  // Sommige banks splitsen Af/Bij in aparte kolommen
  if (k === "af" || k === "debet") return "debit_only";
  if (k === "bij" || k === "credit") return "credit_only";
  // Code "D"/"C" in aparte kolom
  if (k === "afbij" || k === "credebet" || k === "afofbij") return "debit_credit_indicator";

  // IBAN
  if (k === "ibanbban" || k === "iban" || k === "rekening") return "own_iban";
  if (
    k === "tegenrekening" ||
    k === "tegenrekeningiban" ||
    k === "naartegenrekening" ||
    k === "ibantegenpartij"
  )
    return "counter_iban";

  // Tegenpartij naam
  if (
    k === "naamtegenpartij" ||
    k === "naam" ||
    k === "tegenpartij" ||
    k === "naamtegenrekening" ||
    k === "counterparty"
  )
    return "counter_name";

  // Omschrijving (Rabo splitst in 3 velden: Omschrijving-1/2/3)
  if (k.startsWith("omschrijving") || k === "mededelingen" || k === "description")
    return "description";
  if (k === "betalingskenmerk" || k === "endtoendid" || k === "kenmerk")
    return "end_to_end_id";

  // Volgnr / referentie voor dedup
  if (k === "volgnr" || k === "transactienummer" || k === "transactionid")
    return "ext_id";
  if (k === "transref" || k === "transactionreference" || k === "acctsvcrref")
    return "acct_ref";

  // Munt
  if (k === "munt" || k === "currency" || k === "valuta") return "currency";

  return null;
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  // Mogelijke varianten: "+12,34", "-12,34", "12,34", "12.34", "1.234,56"
  let s = raw.trim().replace(/\s/g, "");
  // Sign: leading + of -
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // EU vs US format detectie:
  //   "1.234,56" (EU) vs "1,234.56" (US) vs "12,34" (EU) vs "12.34" (US)
  // We pakken laatste komma OF punt als decimaal.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalPos = -1;
  if (lastComma > lastDot) decimalPos = lastComma;
  else if (lastDot > lastComma) decimalPos = lastDot;
  let normalized: string;
  if (decimalPos === -1) {
    normalized = s;
  } else {
    const intPart = s.slice(0, decimalPos).replace(/[.,]/g, "");
    const decPart = s.slice(decimalPos + 1);
    normalized = `${intPart}.${decPart}`;
  }
  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return n * sign;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO: 2026-05-04
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Rabobank: 2026-05-04 of 04-05-2026 of 04/05/2026
  let m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Compact 20260504 of 04052026
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export interface CsvParseResult {
  iban: string | null;
  transactions: CamtTransaction[];
  warnings: string[];
}

export function parseBankCsv(content: string): CsvParseResult {
  const warnings: string[] = [];

  // Strip BOM en split lines
  const text = content.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV bevat geen data — alleen header (of leeg)");
  }

  const sep = detectSeparator(lines[0]!);
  const headers = parseRow(lines[0]!, sep);
  const fieldMap: Record<number, string> = {};
  headers.forEach((h, i) => {
    const key = classifyHeader(h);
    if (key) fieldMap[i] = key;
  });

  // Sanity check: we hebben minstens date + amount nodig
  const hasDate = Object.values(fieldMap).includes("date") ||
    Object.values(fieldMap).includes("value_date");
  const hasAmount =
    Object.values(fieldMap).includes("amount") ||
    (Object.values(fieldMap).includes("debit_only") &&
      Object.values(fieldMap).includes("credit_only"));
  if (!hasDate || !hasAmount) {
    throw new Error(
      `CSV-headers herkend: [${Object.values(fieldMap).join(", ")}]. ` +
        `Datum + bedrag-kolom niet gevonden — controleer of dit een ` +
        `Rabobank/ING export is.`,
    );
  }

  // Soms staat de eigen IBAN in elke regel — pak 'm uit eerste data-row
  let ownIban: string | null = null;

  const transactions: CamtTransaction[] = [];
  const seenIds = new Set<string>();

  for (let li = 1; li < lines.length; li++) {
    const cols = parseRow(lines[li]!, sep);
    if (cols.length < 2) continue;

    const get = (key: string): string | null => {
      const idx = Object.entries(fieldMap).find(([, v]) => v === key)?.[0];
      if (idx === undefined) return null;
      const val = cols[parseInt(idx)];
      return val ? val.trim() : null;
    };
    // Speciaal: er kunnen meerdere kolommen mappen naar 'description';
    // concateneer ze
    const descParts: string[] = [];
    for (const [idxStr, key] of Object.entries(fieldMap)) {
      if (key === "description") {
        const v = cols[parseInt(idxStr)];
        if (v && v.trim()) descParts.push(v.trim());
      }
    }

    const dateRaw = get("date") || get("value_date");
    const date = dateRaw ? parseDate(dateRaw) : null;
    if (!date) {
      warnings.push(`Regel ${li + 1}: ongeldige datum '${dateRaw}'`);
      continue;
    }

    let amountCents: number | null = null;
    const amtRaw = get("amount");
    if (amtRaw !== null) {
      const v = parseAmount(amtRaw);
      if (v === null) {
        warnings.push(`Regel ${li + 1}: bedrag onparseerbaar '${amtRaw}'`);
        continue;
      }
      amountCents = Math.round(v * 100);
      // ING/Rabo zetten soms aparte indicator: "D"=Debet, "C"=Credit
      const indicator = get("debit_credit_indicator");
      if (indicator) {
        const u = indicator.toUpperCase();
        if (u === "D" || u === "AF" || u === "DEBET") {
          amountCents = -Math.abs(amountCents);
        } else if (u === "C" || u === "BIJ" || u === "CREDIT") {
          amountCents = Math.abs(amountCents);
        }
      }
    } else {
      // Af/Bij in aparte kolommen
      const debit = get("debit_only");
      const credit = get("credit_only");
      const dv = debit ? parseAmount(debit) : null;
      const cv = credit ? parseAmount(credit) : null;
      if (dv && Math.abs(dv) > 0) amountCents = -Math.round(Math.abs(dv) * 100);
      else if (cv && Math.abs(cv) > 0) amountCents = Math.round(Math.abs(cv) * 100);
    }
    if (amountCents === null) {
      warnings.push(`Regel ${li + 1}: kon bedrag niet bepalen`);
      continue;
    }

    const counterName = get("counter_name") || null;
    const counterIban = get("counter_iban") || null;
    const description =
      descParts.length > 0
        ? descParts.join(" ").replace(/\s+/g, " ").trim()
        : get("end_to_end_id");

    const ownInRow = get("own_iban");
    if (ownInRow && !ownIban) {
      ownIban = ownInRow.replace(/\s/g, "").toUpperCase();
    }

    // Dedup: probeer in volgorde acct_ref, ext_id, dan synthetiseer
    const acctRef = get("acct_ref");
    const extIdRaw = get("ext_id");
    const externalId =
      acctRef || extIdRaw || `${date}_${amountCents}_${(description || counterName || "").slice(0, 30)}`;
    // Voorkom collisions binnen één bestand
    let unique = externalId;
    let n = 1;
    while (seenIds.has(unique)) {
      unique = `${externalId}#${n++}`;
    }
    seenIds.add(unique);

    transactions.push({
      external_id: unique,
      date,
      booking_date: get("booking_date"),
      amount_cents: amountCents,
      currency: get("currency") || "EUR",
      counterparty_name: counterName,
      counterparty_iban: counterIban?.replace(/\s/g, "").toUpperCase() || null,
      description: description || null,
    });
  }

  if (transactions.length === 0) {
    warnings.push("Geen transacties geparseerd — controleer bestand");
  }

  return { iban: ownIban, transactions, warnings };
}

/** Detect of een upload XML of CSV is, op basis van eerste niet-lege char. */
export function detectUploadFormat(content: string): "camt" | "csv" {
  const trimmed = content.replace(/^﻿/, "").trimStart();
  if (trimmed.startsWith("<")) return "camt";
  return "csv";
}
