import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { sendInvoiceByEmail } from "@/lib/email/postmark";
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
    const body = await request
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const to = typeof body.to === "string" && body.to.trim() ? body.to : undefined;
    const cc = typeof body.cc === "string" && body.cc.trim() ? body.cc : undefined;
    const result = await sendInvoiceByEmail(params.id, { to, cc });
    return NextResponse.json({ ok: true, message_id: result.message_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Versturen mislukt";
    log.error(
      { scope: "accounting/email", err: msg, invoice_id: params.id },
      "email send failed",
    );
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
