import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { ocrPurchaseInvoice } from "@/lib/ocr/apply";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Re-run OCR op bestaande factuur (handmatige trigger vanuit editor). */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const result = await ocrPurchaseInvoice(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OCR mislukt";
    log.error(
      { scope: "accounting/purchase-ocr", err: msg, invoice_id: params.id },
      "ocr re-run failed",
    );
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
