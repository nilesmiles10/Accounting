/**
 * CAMT.053 / 052 parser — ISO20022 bankafschrift formaat van Rabobank,
 * ABN, ING, etc. Heeft een vrij baroque XML-structuur met PascalCased
 * 4-letter tags.
 *
 * We parsen alleen de velden die we nodig hebben voor matching:
 *   - <BkToCstmrStmt>/<Stmt>/<Acct>/<Id>/<IBAN>  — rekening-IBAN (verifiëren)
 *   - <Ntry> per transactie:
 *       <Amt Ccy="EUR">123.45</Amt>
 *       <CdtDbtInd>CRDT|DBIT</CdtDbtInd>     credit/debit indicator
 *       <BookgDt>/<Dt>YYYY-MM-DD</Dt>         boekdatum
 *       <ValDt>/<Dt>YYYY-MM-DD</Dt>           valutadatum
 *       <NtryRef>...</NtryRef>                 unieke ref voor dedup
 *       <NtryDtls>/<TxDtls>/...                tegenpartij + omschrijving
 *
 * MT940 ondersteuning komt later — CAMT.053 dekt 95% van NL bank
 * downloads sinds 2017.
 *
 * We gebruiken GEEN externe XML parser om de afhankelijkheden klein
 * te houden — een regex-gebaseerde extractor is robuust genoeg voor
 * de paar tags die we nodig hebben en faalt voorspelbaar als de
 * structuur afwijkt.
 */

export interface CamtTransaction {
  external_id: string;
  date: string;            // value date YYYY-MM-DD
  booking_date: string | null;
  amount_cents: number;    // signed
  currency: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  description: string | null;
}

export interface CamtParseResult {
  iban: string | null;
  currency: string;
  transactions: CamtTransaction[];
  stmt_from: string | null;
  stmt_to: string | null;
  warnings: string[];
}

/** Pak inhoud van eerste <Tag>...</Tag> in haystack. */
function pick(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m && m[1] !== undefined ? m[1].trim() : null;
}

/** Pak inhoud van álle <Tag>...</Tag> in haystack. */
function pickAll(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) out.push(m[1].trim());
  }
  return out;
}

/** Parse 1 <Ntry>...</Ntry> blok. Geeft null als kritieke velden missen. */
function parseEntry(xml: string): CamtTransaction | null {
  const amtRaw = xml.match(/<Amt[^>]*Ccy="([^"]+)"[^>]*>([\d.]+)<\/Amt>/);
  if (!amtRaw) return null;
  const currency = amtRaw[1] || "EUR";
  const amount = parseFloat(amtRaw[2] || "0");
  const cdtDbt = pick(xml, "CdtDbtInd"); // CRDT = bij, DBIT = af
  const sign = cdtDbt === "DBIT" ? -1 : 1;
  const amountCents = Math.round(amount * 100) * sign;

  // Booking date / value date (eerste <Dt> binnen <BookgDt> resp <ValDt>)
  const bookgBlock = pick(xml, "BookgDt") || "";
  const valBlock = pick(xml, "ValDt") || "";
  const bookingDate = pick(bookgBlock, "Dt");
  const valueDate = pick(valBlock, "Dt") || bookingDate;
  if (!valueDate) return null;

  // Unieke referentie voor dedup. Volgorde van voorkeur:
  //   1. AcctSvcrRef (account servicer ref, uniek bij Rabobank)
  //   2. EndToEndId (vaak gevuld bij iDEAL/SEPA)
  //   3. NtryRef
  //   4. fallback: hash van datum+amount+description
  const acctSvcrRef = pick(xml, "AcctSvcrRef");
  const endToEndId = pick(xml, "EndToEndId");
  const ntryRef = pick(xml, "NtryRef");

  // Tegenpartij — kan in RltdPties/Cdtr/Nm of RltdPties/Dbtr/Nm staan,
  // afhankelijk van richting. We pakken degene die niet "ons" is.
  const txDtls = pick(xml, "TxDtls") || xml;
  const cdtrName = pick(txDtls, "Cdtr") ? pick(pick(txDtls, "Cdtr")!, "Nm") : null;
  const dbtrName = pick(txDtls, "Dbtr") ? pick(pick(txDtls, "Dbtr")!, "Nm") : null;
  const counterparty =
    cdtDbt === "CRDT" ? dbtrName || null : cdtrName || null;

  // Tegenpartij IBAN
  const cdtrAcct = pick(txDtls, "CdtrAcct");
  const dbtrAcct = pick(txDtls, "DbtrAcct");
  const counterIban =
    cdtDbt === "CRDT"
      ? dbtrAcct
        ? pick(dbtrAcct, "IBAN")
        : null
      : cdtrAcct
        ? pick(cdtrAcct, "IBAN")
        : null;

  // Omschrijving — RmtInf/Ustrd is unstructured remittance info
  const rmtInf = pick(txDtls, "RmtInf") || pick(xml, "RmtInf");
  const ustrd = rmtInf ? pickAll(rmtInf, "Ustrd").join(" ") : null;
  const description = ustrd || pick(xml, "AddtlNtryInf") || endToEndId || null;

  // External_id: kies de meest betrouwbare beschikbaar
  const fallbackId = `${valueDate}_${amountCents}_${(description || "").slice(0, 30)}`;
  const externalId =
    acctSvcrRef || endToEndId || ntryRef || fallbackId;

  return {
    external_id: externalId,
    date: valueDate,
    booking_date: bookingDate,
    amount_cents: amountCents,
    currency,
    counterparty_name: counterparty?.trim() || null,
    counterparty_iban: counterIban?.replace(/\s/g, "").toUpperCase() || null,
    description: description?.trim() || null,
  };
}

export function parseCamt053(xml: string): CamtParseResult {
  const warnings: string[] = [];

  // Validatie
  if (!/<BkToCstmrStmt|<BkToCstmrAcctRpt/.test(xml)) {
    throw new Error(
      "Geen geldig CAMT-bestand: <BkToCstmrStmt> of <BkToCstmrAcctRpt> niet gevonden",
    );
  }

  const stmt = pick(xml, "Stmt") || pick(xml, "Rpt") || xml;

  // Account IBAN — verifieer match met bank_account.iban later
  const acct = pick(stmt, "Acct");
  let iban: string | null = null;
  let currency = "EUR";
  if (acct) {
    iban = pick(acct, "IBAN");
    currency = pick(acct, "Ccy") || "EUR";
    if (iban) iban = iban.replace(/\s/g, "").toUpperCase();
  }

  // Statement period
  const fromTo = pick(stmt, "FrToDt");
  const stmtFrom = fromTo ? pick(fromTo, "FrDtTm")?.slice(0, 10) || null : null;
  const stmtTo = fromTo ? pick(fromTo, "ToDtTm")?.slice(0, 10) || null : null;

  // Alle <Ntry> blokken
  const ntries = pickAll(stmt, "Ntry");
  const transactions: CamtTransaction[] = [];
  for (const block of ntries) {
    const tx = parseEntry(block);
    if (tx) transactions.push(tx);
    else warnings.push("Een <Ntry>-blok kon niet geparseerd worden — overgeslagen");
  }

  if (transactions.length === 0 && ntries.length > 0) {
    warnings.push(
      `${ntries.length} entries gevonden maar geen kon worden geparseerd — controleer bestandformaat`,
    );
  }

  return {
    iban,
    currency,
    transactions,
    stmt_from: stmtFrom,
    stmt_to: stmtTo,
    warnings,
  };
}
