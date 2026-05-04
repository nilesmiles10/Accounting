import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { runQuoteReminders } from "@/lib/email/quoteReminders";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Runner voor reminder-mails. Kan gebruikt worden:
 *   - Door een host-cron (curl met Bearer token uit ACCOUNTING_CRON_SECRET)
 *   - Handmatig door admin (session-cookie auth)
 *
 * Beide paden resulteren in dezelfde runQuoteReminders-call. Idempotent —
 * elke offerte krijgt max 1× een reminder en 1× een expiry-warning.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.ACCOUNTING_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const bearerOk =
    !!cronSecret && auth === `Bearer ${cronSecret}`;

  if (!bearerOk) {
    const deny = await checkAccountingAccess(request);
    if (deny) return deny;
  }

  try {
    const result = await runQuoteReminders();
    log.info({ scope: "accounting/cron", result }, "quote reminders cron ok");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Runner mislukt";
    log.error({ scope: "accounting/cron", err: msg }, "quote reminders failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
