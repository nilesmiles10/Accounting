import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { cancelPurchaseInvoice } from "@/lib/purchase-invoices";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const invoice = cancelPurchaseInvoice(params.id);
    if (!invoice)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Annuleren mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
