import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { sendQuoteByEmail } from "@/lib/email/quoteMail";
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
    const to =
      typeof body.to === "string" && body.to.trim() ? body.to : undefined;
    const cc =
      typeof body.cc === "string" && body.cc.trim() ? body.cc : undefined;
    const result = await sendQuoteByEmail(params.id, { to, cc });
    return NextResponse.json({ ok: true, message_id: result.message_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Versturen mislukt";
    log.error(
      { scope: "accounting/quote-email", err: msg, quote_id: params.id },
      "quote email failed",
    );
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
