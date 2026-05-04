import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { setTransactionStatus } from "@/lib/bank/transactions";

export const dynamic = "force-dynamic";

/**
 * Markeer transactie als 'ignored' — bv interne overboeking, privé,
 * dubbele import. Komt niet terug in matching.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      undo?: boolean;
    };
    setTransactionStatus(
      params.id,
      body.undo ? "unmatched" : "ignored",
      body.undo ? null : body.reason || null,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
