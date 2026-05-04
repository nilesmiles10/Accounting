import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  deleteAccount,
  getAccount,
  updateAccount,
  type AccountUpdate,
} from "@/lib/ledger/accounts";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const account = getAccount(params.code);
  if (!account)
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  return NextResponse.json({ account });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as AccountUpdate;
    const account = updateAccount(params.code, body);
    if (!account)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ account });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bijwerken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const result = deleteAccount(params.code);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
