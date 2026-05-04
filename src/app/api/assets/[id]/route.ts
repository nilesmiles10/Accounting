import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  getAsset,
  updateAsset,
  deleteAsset,
  type AssetUpdate,
} from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const asset = getAsset(params.id);
  if (!asset)
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  return NextResponse.json({ asset });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as AssetUpdate;
    const asset = updateAsset(params.id, body);
    if (!asset)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ asset });
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
  const result = deleteAsset(params.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
