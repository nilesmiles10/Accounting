import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { markPurchasePaid } from "@/lib/purchase-invoices";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      bank_account_code?: string;
      paid_date?: string;
    };
    const invoice = markPurchasePaid(params.id, {
      bankAccountCode: body.bank_account_code,
      paidDate: body.paid_date,
    });
    if (!invoice)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Op betaald zetten mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
