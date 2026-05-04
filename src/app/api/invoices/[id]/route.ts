import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  deleteDraft,
  getInvoiceWithLines,
  updateDraft,
} from "@/lib/invoices";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const invoice = getInvoiceWithLines(params.id);
  if (!invoice) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({ invoice });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = await request.json();
    const invoice = updateDraft(params.id, body);
    if (!invoice) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bijwerken mislukt";
    log.error({ scope: "accounting/invoices", err: msg }, "update failed");
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
    const ok = deleteDraft(params.id);
    if (!ok) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verwijderen mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
