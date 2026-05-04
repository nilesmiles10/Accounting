import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { listEntries, post } from "@/lib/ledger/journal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const sp = request.nextUrl.searchParams;
  const filter = {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    source_type: sp.get("source_type") || undefined,
    source_id: sp.get("source_id") || undefined,
    account_code: sp.get("account_code") || undefined,
  };
  return NextResponse.json({ entries: listEntries(filter) });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = await request.json();
    const entry = post({
      date: body.date,
      description: body.description,
      source_type: body.source_type || "manual",
      source_id: body.source_id || null,
      notes: body.notes || null,
      created_by: "user",
      lines: body.lines || [],
    });
    return NextResponse.json({ entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Boeking mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
