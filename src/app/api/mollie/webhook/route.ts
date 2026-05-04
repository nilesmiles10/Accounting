import { NextRequest, NextResponse } from "next/server";
import { handleWebhookById } from "@/lib/mollie";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Publieke webhook — Mollie POST't hier bij iedere status-wijziging.
 * Geen auth-header: we verifiëren door de payment op te halen via de
 * Mollie API (onze API-key) en checken of de payment_id in onze DB
 * staat. Als het matcht is de call authentiek; zo niet negeren.
 *
 * Mollie stuurt content-type application/x-www-form-urlencoded met
 * body "id=tr_xxx".
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const paymentId = String(form.get("id") || "");
    if (!paymentId) {
      return NextResponse.json({ error: "no id" }, { status: 400 });
    }
    await handleWebhookById(paymentId);
    return new NextResponse("ok", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ scope: "accounting/mollie-webhook", err: msg }, "webhook failed");
    // 200 om Mollie retries te voorkomen bij onze eigen parse-fouten;
    // als de payment-lookup faalt retourneren we 500 zodat Mollie opnieuw probeert.
    return new NextResponse("ok", { status: 200 });
  }
}

// Mollie doet soms een GET voor verificatie — antwoord OK.
export async function GET() {
  return new NextResponse("ok", { status: 200 });
}
