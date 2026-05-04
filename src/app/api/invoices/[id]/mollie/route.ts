import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { createOrReusePayment } from "@/lib/mollie";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const invoice = await createOrReusePayment(params.id);
    return NextResponse.json({
      invoice,
      payment_url: invoice.mollie_payment_url,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Betaallink aanmaken mislukt";
    log.error({ scope: "accounting/mollie", err: msg }, "create payment failed");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
