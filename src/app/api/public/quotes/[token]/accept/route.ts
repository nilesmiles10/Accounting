import { NextRequest, NextResponse } from "next/server";
import {
  acceptQuoteByToken,
  convertQuoteToInvoice,
  getQuoteByPublicToken,
  ensureInvoicePublicTokenFromQuote,
} from "@/lib/quotes";
import { finalizeInvoice } from "@/lib/invoices";
import { notifyQuoteAccepted } from "@/lib/email/quoteMail";
import {
  createOrReusePayment,
  getMollieSettings,
} from "@/lib/mollie";
import { log } from "@/lib/logger";
import { getAccountingBaseUrl } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Vul je naam in (min. 2 tekens)" },
        { status: 400 },
      );
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const existing = getQuoteByPublicToken(params.token);
    const existingStatus = existing?.status;
    const shouldAutoInvoice = !!existing?.auto_invoice_on_accept;

    const quote = acceptQuoteByToken(params.token, name, ip);

    // Eigenaar-notificatie alleen bij eerste accept
    if (existingStatus === "sent") {
      try {
        await notifyQuoteAccepted(quote.id);
      } catch (err) {
        log.error(
          {
            scope: "accounting/quote-notify",
            err: err instanceof Error ? err.message : String(err),
          },
          "owner notification failed",
        );
      }
    }

    // Auto-factuur + Mollie betaallink als ingeschakeld en Mollie beschikbaar
    let invoiceViewUrl: string | null = null;
    if (shouldAutoInvoice && existingStatus === "sent") {
      try {
        const inv = convertQuoteToInvoice(quote.id);
        // Direct finaliseren (status → sent, nummer toegekend, snapshot gemaakt)
        finalizeInvoice(inv.id);
        // Publiek view-token is al aangemaakt in finalize, maar voor backfill
        const token = ensureInvoicePublicTokenFromQuote(inv.id);
        const baseUrl = getAccountingBaseUrl();
        invoiceViewUrl = `${baseUrl}/invoice-view/${token}`;

        // Mollie-payment genereren als key gezet
        if (getMollieSettings().api_key) {
          try {
            await createOrReusePayment(inv.id);
          } catch (err) {
            log.warn(
              {
                scope: "accounting/quote-auto-invoice",
                err: err instanceof Error ? err.message : String(err),
                invoice_id: inv.id,
              },
              "Mollie-payment maken faalde (factuur is wel gefinaliseerd)",
            );
          }
        }
      } catch (err) {
        log.error(
          {
            scope: "accounting/quote-auto-invoice",
            err: err instanceof Error ? err.message : String(err),
            quote_id: quote.id,
          },
          "auto-invoice na accept faalde",
        );
      }
    }

    return NextResponse.json({ ok: true, invoice_view_url: invoiceViewUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Accept mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
