import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { ensureInvoicePublicToken } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const token = ensureInvoicePublicToken(params.id);
    return NextResponse.json({ public_token: token });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Token genereren mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
