import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  deleteQuoteDraft,
  getQuoteWithLines,
  updateQuoteDraft,
} from "@/lib/quotes";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const quote = getQuoteWithLines(params.id);
  if (!quote) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({ quote });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = await request.json();
    const quote = updateQuoteDraft(params.id, body);
    if (!quote) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ quote });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bijwerken mislukt";
    log.error({ scope: "accounting/quotes", err: msg }, "update failed");
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
    const ok = deleteQuoteDraft(params.id);
    if (!ok)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verwijderen mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
