import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { approvePurchaseInvoice } from "@/lib/purchase-invoices";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const invoice = approvePurchaseInvoice(params.id);
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Goedkeuren mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
