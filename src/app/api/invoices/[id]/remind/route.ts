import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { sendInvoiceReminder } from "@/lib/email/invoiceReminders";
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
    const result = await sendInvoiceReminder(params.id);
    return NextResponse.json({ ok: true, message_id: result.message_id });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Herinnering versturen mislukt";
    log.error(
      { scope: "accounting/invoice-remind", err: msg },
      "manual reminder failed",
    );
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
