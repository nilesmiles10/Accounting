import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { convertQuoteToInvoice } from "@/lib/quotes";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const invoice = convertQuoteToInvoice(params.id);
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Converteren mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
