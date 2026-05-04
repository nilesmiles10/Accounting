import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { finalizeQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const quote = finalizeQuote(params.id);
    return NextResponse.json({ quote });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Finaliseren mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
