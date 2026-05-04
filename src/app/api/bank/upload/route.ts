import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  getBankAccount,
  recordSync,
} from "@/lib/bank/accounts";
import { upsertTransaction } from "@/lib/bank/transactions";
import { parseCamt053 } from "@/lib/bank/providers/camt";
import {
  parseBankCsv,
  detectUploadFormat,
} from "@/lib/bank/providers/csv";
import { autoMatchPending } from "@/lib/bank/match";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Upload CAMT.053 / 052 XML bestand. Parst → upsert transacties (dedup
 * op external_id) → run auto-match.
 *
 * Request: multipart/form-data met fields:
 *   bank_account_id: UUID
 *   file: XML bestand
 *
 * Response: { inserted: N, skipped: N, auto_matched: N }
 */
export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const formData = await request.formData();
    const bankAccountId = String(formData.get("bank_account_id") || "");
    const file = formData.get("file");
    if (!bankAccountId || !file || typeof file === "string") {
      return NextResponse.json(
        { error: "bank_account_id en file zijn verplicht" },
        { status: 400 },
      );
    }
    const account = getBankAccount(bankAccountId);
    if (!account) {
      return NextResponse.json(
        { error: "Bank-rekening niet gevonden" },
        { status: 404 },
      );
    }

    const content = await (file as File).text();
    const format = detectUploadFormat(content);
    const parsed =
      format === "camt"
        ? parseCamt053(content)
        : { ...parseBankCsv(content), stmt_from: null, stmt_to: null };

    // IBAN-check: als bestand een IBAN heeft en account ook, moeten ze matchen
    if (parsed.iban && account.iban && parsed.iban !== account.iban) {
      return NextResponse.json(
        {
          error: `IBAN-mismatch: bestand heeft ${parsed.iban}, rekening heeft ${account.iban}`,
        },
        { status: 400 },
      );
    }

    let inserted = 0;
    let skipped = 0;
    for (const tx of parsed.transactions) {
      const r = upsertTransaction({
        bank_account_id: account.id,
        external_id: tx.external_id,
        date: tx.date,
        booking_date: tx.booking_date,
        amount_cents: tx.amount_cents,
        currency: tx.currency,
        counterparty_name: tx.counterparty_name,
        counterparty_iban: tx.counterparty_iban,
        description: tx.description,
        raw: tx,
      });
      if (r.inserted) inserted++;
      else skipped++;
    }

    recordSync(account.id, { ok: true });

    // Direct auto-match draaien zodat user gelijk de groene vinkjes ziet
    const auto = autoMatchPending(account.id);

    log.info(
      {
        scope: "bank/upload",
        format,
        account_id: account.id,
        inserted,
        skipped,
        auto_matched: auto.matched,
        warnings: parsed.warnings.length,
      },
      `${format.toUpperCase()} upload verwerkt`,
    );

    return NextResponse.json({
      inserted,
      skipped,
      auto_matched: auto.matched,
      warnings: parsed.warnings,
      stmt_from: parsed.stmt_from,
      stmt_to: parsed.stmt_to,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload mislukt";
    log.error(
      { scope: "bank/camt-upload", err: msg },
      "CAMT upload faalde",
    );
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
