import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  deletePurchaseInvoice,
  getPurchaseInvoiceWithLines,
  updatePurchaseInvoice,
  type PurchaseUpdateInput,
} from "@/lib/purchase-invoices";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const invoice = getPurchaseInvoiceWithLines(params.id);
  if (!invoice)
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  return NextResponse.json({ invoice });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as PurchaseUpdateInput;
    const invoice = updatePurchaseInvoice(params.id, body);
    if (!invoice)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bijwerken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const ok = deletePurchaseInvoice(params.id);
    if (!ok)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verwijderen mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
