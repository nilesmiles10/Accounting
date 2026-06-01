import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTransaction, setTransactionStatus } from "./transactions";
import { getBankAccount } from "./accounts";
import { post } from "@/lib/ledger/journal";
import { log } from "@/lib/logger";
import crypto from "crypto";

export interface MatchSuggestion {
  target_type: "invoice" | "purchase";
  target_id: string;
  target_number: string;
  target_party: string;
  target_amount_cents: number;
  target_due_date: string | null;
  confidence: "auto_high" | "suggested";
  reason: string;
}

/**
 * Zoek match-kandidaten voor een transactie. Heuristiek:
 *   1. POSITIEF (geld erop) → zoek openstaande verkoopfactuur (status sent/overdue)
 *      a. Bedrag exact + factuurnummer in description → auto_high
 *      b. Bedrag exact + naam matcht klant → suggested
 *      c. Alleen bedrag exact → suggested (top-3)
 *   2. NEGATIEF (geld eraf) → zoek goedgekeurde inkoopfactuur (status approved)
 *      a. Bedrag exact + supplier_invoice_number in description → auto_high
 *      b. Bedrag exact + naam matcht leverancier → suggested
 *      c. Alleen bedrag exact → suggested (top-3)
 *
 * Negatieve transacties zonder match → mogelijk privé-uitgave / kosten,
 * gebruiker boekt handmatig of zet op ignored.
 */
export function suggestMatches(txId: string): MatchSuggestion[] {
  const tx = getTransaction(txId);
  if (!tx) return [];
  if (tx.status !== "unmatched") return [];

  const isIncoming = tx.amount_cents > 0;
  const absAmount = Math.abs(tx.amount_cents);
  const desc = (tx.description || "").toLowerCase();
  const cpName = (tx.counterparty_name || "").toLowerCase();
  const db = getDb();
  const tenantId = getCurrentTenantId();

  const out: MatchSuggestion[] = [];

  if (isIncoming) {
    // Verkoopfacturen — open
    const candidates = db
      .prepare(
        `SELECT i.id, i.number, i.total_cents, i.due_date, c.name AS client_name
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         WHERE i.tenant_id = ?
           AND i.status IN ('sent', 'overdue')
           AND i.is_credit_note = 0`,
      )
      .all(tenantId) as Array<{
      id: string;
      number: string;
      total_cents: number;
      due_date: string;
      client_name: string;
    }>;

    for (const inv of candidates) {
      if (inv.total_cents !== absAmount) continue;
      const numberInDesc =
        desc.includes(inv.number.toLowerCase()) ||
        desc.replace(/\s/g, "").includes(inv.number.toLowerCase().replace(/\s/g, ""));
      const nameMatch =
        cpName.length > 2 &&
        inv.client_name.toLowerCase().includes(cpName.split(" ")[0]!) ||
        (cpName && inv.client_name.toLowerCase().includes(cpName));
      let confidence: "auto_high" | "suggested" = "suggested";
      let reason = "Bedrag exact";
      if (numberInDesc) {
        confidence = "auto_high";
        reason = `Bedrag + factuurnummer ${inv.number} in omschrijving`;
      } else if (nameMatch) {
        reason = `Bedrag exact + klant matcht`;
      }
      out.push({
        target_type: "invoice",
        target_id: inv.id,
        target_number: inv.number,
        target_party: inv.client_name,
        target_amount_cents: inv.total_cents,
        target_due_date: inv.due_date,
        confidence,
        reason,
      });
    }
  } else {
    // Inkoopfacturen — open (approved, not paid)
    const candidates = db
      .prepare(
        `SELECT p.id,
                COALESCE(p.supplier_invoice_number, substr(p.id, 1, 8)) AS number,
                p.total_cents,
                p.due_date,
                COALESCE(s.name, 'Onbekende leverancier') AS supplier_name
         FROM purchase_invoices p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.tenant_id = ?
           AND p.status = 'approved'`,
      )
      .all(tenantId) as Array<{
      id: string;
      number: string;
      total_cents: number;
      due_date: string;
      supplier_name: string;
    }>;

    for (const inv of candidates) {
      if (inv.total_cents !== absAmount) continue;
      const numberInDesc =
        inv.number &&
        desc.replace(/\s/g, "").includes(inv.number.toLowerCase().replace(/\s/g, ""));
      const nameMatch =
        cpName.length > 2 &&
        inv.supplier_name.toLowerCase().includes(cpName.split(" ")[0]!);
      let confidence: "auto_high" | "suggested" = "suggested";
      let reason = "Bedrag exact";
      if (numberInDesc) {
        confidence = "auto_high";
        reason = `Bedrag + factuurnr ${inv.number} in omschrijving`;
      } else if (nameMatch) {
        reason = `Bedrag exact + leverancier matcht`;
      }
      out.push({
        target_type: "purchase",
        target_id: inv.id,
        target_number: inv.number,
        target_party: inv.supplier_name,
        target_amount_cents: inv.total_cents,
        target_due_date: inv.due_date,
        confidence,
        reason,
      });
    }
  }

  // Sorteer auto_high voor suggested, daarna op due_date asc (oudste eerst)
  out.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === "auto_high" ? -1 : 1;
    }
    return (a.target_due_date || "").localeCompare(b.target_due_date || "");
  });

  return out.slice(0, 5);
}

/**
 * Voer match uit: koppel transactie aan invoice/purchase, boek het
 * bijbehorende journaal (1100→1300 of 1600→1100), en zet beide
 * statuses bij.
 */
export function applyMatch(input: {
  transaction_id: string;
  target_type: "invoice" | "purchase";
  target_id: string;
  confidence: "auto_high" | "suggested" | "manual";
}): { ok: boolean; error?: string; journal_entry_id?: string } {
  const tx = getTransaction(input.transaction_id);
  if (!tx) return { ok: false, error: "Transactie niet gevonden" };
  if (tx.status === "matched") {
    return { ok: false, error: "Transactie is al gematched" };
  }
  const account = getBankAccount(tx.bank_account_id);
  if (!account) {
    return { ok: false, error: "Bank-rekening niet gevonden" };
  }

  let journalId: string | null = null;
  try {
    if (input.target_type === "invoice") {
      // Verkoopfactuur: gebruik markPaid die postInvoicePaid triggert
      // met onze bank-rekening. Maar markPaid hardcoded 1100 — we boeken
      // hier handmatig en updaten de invoice status apart zodat de
      // juiste account_code gebruikt wordt.
      const db = getDb();
      const inv = db
        .prepare(
          "SELECT id, number, total_cents, client_id, company_id, status FROM invoices WHERE id = ?",
        )
        .get(input.target_id) as
        | {
            id: string;
            number: string;
            total_cents: number;
            client_id: string;
            company_id: string;
            status: string;
          }
        | undefined;
      if (!inv) return { ok: false, error: "Factuur niet gevonden" };
      if (inv.status === "paid") {
        // Al betaald — maar transactie nog niet gekoppeld; alleen match-record.
      } else {
        const bankRef = tx.description ? ` · ${tx.description}` : "";
        const cpName = tx.counterparty_name ? ` · ${tx.counterparty_name}` : "";
        const entry = post({
          date: tx.date,
          description: `Betaling factuur ${inv.number} via ${account.display_name}${cpName}${bankRef}`,
          source_type: "bank_match",
          source_id: tx.id,
          company_id: inv.company_id,
          lines: [
            {
              account_code: account.account_code,
              description: `Ontvangen ${inv.number}${cpName}${bankRef}`,
              debit_cents: inv.total_cents,
              client_id: inv.client_id,
            },
            {
              account_code: "1300",
              description: `Aflossing debiteur — ${inv.number}${cpName}`,
              credit_cents: inv.total_cents,
              client_id: inv.client_id,
            },
          ],
        });
        journalId = entry.id;
        db.prepare(
          `UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`,
        ).run(Date.now(), Date.now(), inv.id);
      }
    } else {
      // Inkoopfactuur
      const db = getDb();
      const inv = db
        .prepare(
          `SELECT id, supplier_invoice_number, total_cents, supplier_id, company_id, status
           FROM purchase_invoices WHERE id = ?`,
        )
        .get(input.target_id) as
        | {
            id: string;
            supplier_invoice_number: string | null;
            total_cents: number;
            supplier_id: string | null;
            company_id: string;
            status: string;
          }
        | undefined;
      if (!inv) return { ok: false, error: "Inkoopfactuur niet gevonden" };
      if (inv.status === "paid") {
        // Al betaald — alleen match-record
      } else {
        const invNr = inv.supplier_invoice_number || "";
        const cpName = tx.counterparty_name ? ` · ${tx.counterparty_name}` : "";
        const bankRef = tx.description ? ` · ${tx.description}` : "";
        const entry = post({
          date: tx.date,
          description: `Betaling inkoop ${invNr} via ${account.display_name}${cpName}${bankRef}`.trim(),
          source_type: "bank_match",
          source_id: tx.id,
          company_id: inv.company_id,
          lines: [
            {
              account_code: "1600",
              description: `Aflossing crediteur — ${invNr}${cpName}`,
              debit_cents: inv.total_cents,
              supplier_id: inv.supplier_id ?? null,
            },
            {
              account_code: account.account_code,
              description: `Betaald ${invNr}${bankRef}`,
              credit_cents: inv.total_cents,
              supplier_id: inv.supplier_id ?? null,
            },
          ],
        });
        journalId = entry.id;
        db.prepare(
          `UPDATE purchase_invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`,
        ).run(Date.now(), Date.now(), inv.id);
      }
    }

    // Match-record + transactie status
    const db = getDb();
    db.prepare(
      `INSERT INTO bank_matches (id, tenant_id, transaction_id, target_type,
         target_id, amount_cents, journal_entry_id, confidence, matched_at, matched_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'system')`,
    ).run(
      crypto.randomUUID(),
      getCurrentTenantId(),
      tx.id,
      input.target_type,
      input.target_id,
      tx.amount_cents,
      journalId,
      input.confidence,
      Date.now(),
    );
    setTransactionStatus(tx.id, "matched");

    return { ok: true, journal_entry_id: journalId ?? undefined };
  } catch (err) {
    log.error(
      {
        scope: "bank/match",
        tx_id: tx.id,
        err: err instanceof Error ? err.message : String(err),
      },
      "match toepassen mislukt",
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Boeking mislukt",
    };
  }
}

/**
 * Boek transactie rechtstreeks op een grootboekrekening, zonder factuur.
 * Voor: bankkosten, privé-opnames, overboekingen tussen eigen rekeningen,
 * btw-afdrachten, etc.
 *
 * Boeking-richting:
 *   - Inkomend (amount > 0): Debet bank / Credit gekozen rekening
 *   - Uitgaand (amount < 0): Debet gekozen rekening / Credit bank
 *
 * Markeert transactie als matched zodat 'ie uit de unmatched-lijst gaat.
 */
export interface DirectBookingSuggestion {
  account_code: string;
  account_name: string;
  vat_code: string | null;
  seen_count: number;
}

/**
 * Patroonherkenning voor directe boekingen.
 *
 * Kijkt naar eerdere bank_matches met target_type='account' (jij hebt
 * eerder iets handmatig direct geboekt) en zoekt een match op
 * counterparty_name of description-fingerprint. Geeft de meest-
 * voorkomende (account_code, vat_code) combinatie terug.
 *
 * Niet auto-executen — alleen voorstel. Auto-execute zou bij
 * incidentele directe boekingen verkeerd kunnen werken (een Stripe-
 * fee dummy is geen Stripe-payout).
 *
 * Drempels:
 *   - >=2 zelfde combinatie → suggested
 *   - 1x → niet getoond (1 datapunt is geen patroon)
 *
 * Fingerprint-strategie: gebruik counterparty_name als die er is,
 * anders eerste 40 chars van description (lowercase, trim). Bank
 * costs hebben vaak geen counterparty, dus description fallback is
 * essentieel.
 */
export function suggestDirectBooking(
  txId: string,
): DirectBookingSuggestion | null {
  const tx = getTransaction(txId);
  if (!tx) return null;
  if (tx.status !== "unmatched") return null;

  const db = getDb();
  const tenantId = getCurrentTenantId();

  const cp = (tx.counterparty_name || "").trim().toLowerCase();
  const descKey = (tx.description || "").trim().toLowerCase().slice(0, 40);
  // Eén van de twee moet aanwezig zijn — zonder pattern-key geen match
  if (!cp && descKey.length < 4) return null;

  const incoming = tx.amount_cents > 0;

  // Match op zowel cp als descKey: trefkans groter, alleen exact-prefix
  // op desc-key (eerste 40 chars) en exact-lowercase op cp.
  const row = db
    .prepare(
      `SELECT jl.account_code, jl.vat_code,
              a.name AS account_name,
              COUNT(*) AS n
       FROM bank_matches bm
       JOIN bank_transactions bt ON bt.id = bm.transaction_id
       JOIN journal_entries je ON je.id = bm.journal_entry_id
       JOIN journal_lines jl ON jl.journal_entry_id = je.id
       LEFT JOIN chart_of_accounts a ON a.code = jl.account_code
         AND a.tenant_id = bm.tenant_id
       WHERE bm.tenant_id = ?
         AND bm.target_type = 'account'
         AND bt.id != ?
         AND (
           (? != '' AND LOWER(COALESCE(bt.counterparty_name, '')) = ?) OR
           (? != '' AND LOWER(SUBSTR(COALESCE(bt.description, ''), 1, 40)) = ?)
         )
         AND ((? = 1 AND bt.amount_cents > 0) OR (? = 0 AND bt.amount_cents < 0))
         AND jl.account_code NOT LIKE '11%'
         AND jl.account_code NOT IN ('1500', '1700')
       GROUP BY jl.account_code, jl.vat_code
       ORDER BY n DESC, jl.account_code
       LIMIT 1`,
    )
    .get(
      tenantId,
      tx.id,
      cp,
      cp,
      descKey,
      descKey,
      incoming ? 1 : 0,
      incoming ? 1 : 0,
    ) as
    | {
        account_code: string;
        vat_code: string | null;
        account_name: string | null;
        n: number;
      }
    | undefined;

  if (!row || row.n < 2) return null;
  return {
    account_code: row.account_code,
    account_name: row.account_name || row.account_code,
    vat_code: row.vat_code,
    seen_count: row.n,
  };
}

/**
 * Batch-versie voor de transacties-listing pagina. Eén query voor N
 * transacties tegelijk i.p.v. N afzonderlijke calls.
 */
export function suggestDirectBookingsBatch(
  txIds: string[],
): Map<string, DirectBookingSuggestion> {
  const result = new Map<string, DirectBookingSuggestion>();
  if (txIds.length === 0) return result;
  for (const id of txIds) {
    const s = suggestDirectBooking(id);
    if (s) result.set(id, s);
  }
  return result;
}

export function bookTransactionDirect(input: {
  transaction_id: string;
  account_code: string;
  description?: string;
  vat_code?: string | null;
}): { ok: boolean; error?: string; journal_entry_id?: string } {
  const tx = getTransaction(input.transaction_id);
  if (!tx) return { ok: false, error: "Transactie niet gevonden" };
  if (tx.status === "matched") {
    return { ok: false, error: "Transactie is al gematched" };
  }
  const account = getBankAccount(tx.bank_account_id);
  if (!account) {
    return { ok: false, error: "Bank-rekening niet gevonden" };
  }

  // Sanity: account_code moet bestaan in COA
  const db = getDb();
  const accCheck = db
    .prepare("SELECT code FROM chart_of_accounts WHERE code = ? AND tenant_id = ?")
    .get(input.account_code, getCurrentTenantId()) as
    | { code: string }
    | undefined;
  if (!accCheck) {
    return { ok: false, error: `Rekening ${input.account_code} bestaat niet` };
  }

  const amount = Math.abs(tx.amount_cents);
  const incoming = tx.amount_cents > 0;
  // Subject = wat user kort herkent (eigen omschrijving > counterparty > bank desc)
  const subject =
    input.description?.trim() ||
    tx.counterparty_name ||
    tx.description ||
    "Bank-mutatie";
  // Reference = bank-kenmerk (omschrijving uit het bankafschrift). Komt
  // mee als detail-regel zodat factuurnummer / mededeling traceerbaar
  // blijft in journaal en grootboekkaart, ook als user een eigen
  // omschrijving meegaf.
  const bankRef = tx.description && tx.description !== subject
    ? tx.description
    : null;
  // Per-line description: subject; bank-ref hangen we als suffix aan
  // zodat de kenmerk meekomt in de grootboekkaart-rij.
  const lineDesc = bankRef ? `${subject} — ${bankRef}` : subject;

  // BTW-splitsing voor 21% / 9% (NL-tarieven). Inclusief bedrag wordt
  // gesplitst in grondslag + BTW; BTW komt op 1500 (voorbelasting, bij
  // uitgaande betaling = inkoop) of 1700 (verschuldigd, bij inkomende
  // betaling = omzet). Bedragen in cents, BTW = round(amount * rate /
  // (100 + rate)) zodat afronding aan de BTW-kant gebeurt en de
  // grondslag het sluitstuk is — geen halve centen tegen 1500/1700.
  const ACCOUNT_VAT_RECEIVABLE = "1500"; // voorbelasting
  const ACCOUNT_VAT_PAYABLE = "1700"; // af te dragen
  const vatRate =
    input.vat_code === "21" ? 21 : input.vat_code === "9" ? 9 : 0;
  const splitVat = vatRate > 0;
  const vatCents = splitVat
    ? Math.round((amount * vatRate) / (100 + vatRate))
    : 0;
  const baseCents = amount - vatCents;

  let journalId: string | null = null;
  try {
    let lines: Parameters<typeof post>[0]["lines"];
    if (incoming) {
      // Geld binnen: Debet bank totaal / Credit omzet excl + Credit BTW te betalen
      lines = [
        {
          account_code: account.account_code,
          description: lineDesc,
          debit_cents: amount,
        },
        {
          account_code: input.account_code,
          description: lineDesc,
          credit_cents: baseCents,
          vat_code: input.vat_code ?? null,
        },
      ];
      if (splitVat) {
        lines.push({
          account_code: ACCOUNT_VAT_PAYABLE,
          description: `BTW ${vatRate}% — ${lineDesc}`,
          credit_cents: vatCents,
          vat_code: input.vat_code ?? null,
        });
      }
    } else {
      // Geld uit: Debet kosten excl + Debet BTW vorderingen / Credit bank totaal
      lines = [
        {
          account_code: input.account_code,
          description: lineDesc,
          debit_cents: baseCents,
          vat_code: input.vat_code ?? null,
        },
      ];
      if (splitVat) {
        lines.push({
          account_code: ACCOUNT_VAT_RECEIVABLE,
          description: `BTW ${vatRate}% — ${lineDesc}`,
          debit_cents: vatCents,
          vat_code: input.vat_code ?? null,
        });
      }
      lines.push({
        account_code: account.account_code,
        description: lineDesc,
        credit_cents: amount,
      });
    }
    const entry = post({
      date: tx.date,
      description: `${subject} · ${account.display_name}${bankRef ? ` · ${bankRef}` : ""}`,
      source_type: "bank_match",
      source_id: tx.id,
      company_id: account.company_id,
      lines,
    });
    journalId = entry.id;

    db.prepare(
      `INSERT INTO bank_matches (id, tenant_id, transaction_id, target_type,
         target_id, amount_cents, journal_entry_id, confidence, matched_at, matched_by)
       VALUES (?, ?, ?, 'account', ?, ?, ?, 'manual', ?, 'user')`,
    ).run(
      crypto.randomUUID(),
      getCurrentTenantId(),
      tx.id,
      input.account_code,
      tx.amount_cents,
      journalId,
      Date.now(),
    );
    setTransactionStatus(tx.id, "matched");

    return { ok: true, journal_entry_id: journalId };
  } catch (err) {
    log.error(
      {
        scope: "bank/book-direct",
        tx_id: tx.id,
        account_code: input.account_code,
        err: err instanceof Error ? err.message : String(err),
      },
      "direct boeking mislukt",
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Boeking mislukt",
    };
  }
}

/**
 * Run auto-match over alle unmatched transacties: voor elke één met
 * confidence=auto_high, koppel automatisch. Voor lager → blijft op
 * unmatched, gebruiker kiest.
 */
export function autoMatchPending(bankAccountId?: string): {
  matched: number;
  skipped: number;
} {
  const db = getDb();
  const where = bankAccountId
    ? `WHERE tenant_id = ? AND bank_account_id = ? AND status = 'unmatched'`
    : `WHERE tenant_id = ? AND status = 'unmatched'`;
  const values: unknown[] = bankAccountId
    ? [getCurrentTenantId(), bankAccountId]
    : [getCurrentTenantId()];
  const ids = db
    .prepare(`SELECT id FROM bank_transactions ${where}`)
    .all(...values) as Array<{ id: string }>;

  let matched = 0;
  let skipped = 0;
  for (const { id } of ids) {
    const suggestions = suggestMatches(id);
    const auto = suggestions.find((s) => s.confidence === "auto_high");
    if (auto) {
      const r = applyMatch({
        transaction_id: id,
        target_type: auto.target_type,
        target_id: auto.target_id,
        confidence: "auto_high",
      });
      if (r.ok) matched++;
      else skipped++;
    } else {
      skipped++;
    }
  }
  return { matched, skipped };
}
