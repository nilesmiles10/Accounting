import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  applyMatch,
  suggestMatches,
} from "@/lib/bank/match";

export const dynamic = "force-dynamic";

/** GET: lever match-suggesties voor deze transactie. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const suggestions = suggestMatches(params.id);
  return NextResponse.json({ suggestions });
}

/** POST: voer match uit. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      target_type: "invoice" | "purchase";
      target_id: string;
      confidence?: "auto_high" | "suggested" | "manual";
    };
    if (!body.target_type || !body.target_id) {
      return NextResponse.json(
        { error: "target_type en target_id zijn verplicht" },
        { status: 400 },
      );
    }
    const result = applyMatch({
      transaction_id: params.id,
      target_type: body.target_type,
      target_id: body.target_id,
      confidence: body.confidence || "manual",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      journal_entry_id: result.journal_entry_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Match mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
