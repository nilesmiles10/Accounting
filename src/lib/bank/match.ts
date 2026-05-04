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
        const entry = post({
          date: tx.date,
          description: `Betaling factuur ${inv.number} via ${account.display_name}`,
          source_type: "bank_match",
          source_id: tx.id,
          company_id: inv.company_id,
          lines: [
            {
              account_code: account.account_code,
              description: `Ontvangen ${inv.number}`,
              debit_cents: inv.total_cents,
              client_id: inv.client_id,
            },
            {
              account_code: "1300",
              description: `Aflossing debiteur — ${inv.number}`,
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
        const entry = post({
          date: tx.date,
          description: `Betaling inkoop ${inv.supplier_invoice_number || ""} via ${account.display_name}`.trim(),
          source_type: "bank_match",
          source_id: tx.id,
          company_id: inv.company_id,
          lines: [
            {
              account_code: "1600",
              description: `Aflossing crediteur — ${inv.supplier_invoice_number || ""}`,
              debit_cents: inv.total_cents,
              supplier_id: inv.supplier_id ?? null,
            },
            {
              account_code: account.account_code,
              description: `Betaald ${inv.supplier_invoice_number || ""}`,
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
