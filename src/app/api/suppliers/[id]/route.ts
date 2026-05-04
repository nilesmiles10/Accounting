import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  deleteSupplier,
  getSupplier,
  updateSupplier,
  type SupplierUpdate,
} from "@/lib/suppliers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const supplier = getSupplier(params.id);
  if (!supplier) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  return NextResponse.json({ supplier });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as SupplierUpdate;
    const supplier = updateSupplier(params.id, body);
    if (!supplier)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ supplier });
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
    const ok = deleteSupplier(params.id);
    if (!ok) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verwijderen mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
