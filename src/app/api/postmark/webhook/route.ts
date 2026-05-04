import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Postmark webhook endpoint — ontvangt Open-, Click-, Delivery-, Bounce- en
 * SpamComplaint-events. Postmark stuurt geen auth; we herkennen events aan
 * ons eigen Metadata-veld dat bij sendEmail meegaat (type + id).
 *
 * Verstuurde mails krijgen metadata: { type: "invoice"|"quote"|"reminder"|
 * "expiry", invoice_id?, quote_id? }. Op basis daarvan updaten we de juiste
 * tabel.
 *
 * Optioneel: zet POSTMARK_WEBHOOK_SECRET env → query ?secret=xxx vereist.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.POSTMARK_WEBHOOK_SECRET;
  if (secret) {
    const q = request.nextUrl.searchParams.get("secret");
    if (!q || !safeEq(q, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = (await request.json()) as PostmarkEvent;
    const meta = body.Metadata || {};
    const type = meta.type || "";
    const quoteId = meta.quote_id || null;
    const invoiceId = meta.invoice_id || null;
    const recordType = body.RecordType;

    const db = getDb();
    const now = Date.now();

    if (recordType === "Open" || recordType === "Click") {
      const isClick = recordType === "Click";
      const countCol = isClick ? "link_click_count" : "open_count";
      const timeCol = isClick ? "last_clicked_at" : "last_opened_at";

      if (quoteId) {
        db.prepare(
          `UPDATE quotes SET ${countCol} = ${countCol} + 1, ${timeCol} = ?, updated_at = ? WHERE id = ?`,
        ).run(now, now, quoteId);
      } else if (invoiceId) {
        db.prepare(
          `UPDATE invoices SET ${countCol} = ${countCol} + 1, ${timeCol} = ?, updated_at = ? WHERE id = ?`,
        ).run(now, now, invoiceId);
      }
    }

    if (recordType === "Bounce" || recordType === "SpamComplaint") {
      // Log als event op de bijbehorende quote/invoice.
      if (quoteId) {
        db.prepare(
          `INSERT INTO quote_events (id, quote_id, type, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          crypto.randomUUID(),
          quoteId,
          recordType === "Bounce" ? "bounced" : "spam_complaint",
          JSON.stringify({ type, description: body.Description }),
          now,
        );
      }
      if (invoiceId) {
        db.prepare(
          `INSERT INTO invoice_events (id, invoice_id, type, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          crypto.randomUUID(),
          invoiceId,
          recordType === "Bounce" ? "bounced" : "spam_complaint",
          JSON.stringify({ type, description: body.Description }),
          now,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error(
      {
        scope: "accounting/postmark-webhook",
        err: err instanceof Error ? err.message : String(err),
      },
      "webhook handler failed",
    );
    return NextResponse.json({ ok: false }, { status: 200 });
    // Altijd 200 terug om retries te voorkomen — wij bouwen zelf audit-log via logger.
  }
}

interface PostmarkEvent {
  RecordType:
    | "Open"
    | "Click"
    | "Delivery"
    | "Bounce"
    | "SpamComplaint"
    | "SubscriptionChange"
    | string;
  MessageID: string;
  Metadata?: {
    type?: string;
    quote_id?: string;
    invoice_id?: string;
  };
  Description?: string;
}

function safeEq(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
