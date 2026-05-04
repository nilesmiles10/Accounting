import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { autoMatchPending } from "@/lib/bank/match";

export const dynamic = "force-dynamic";

/** Run auto-match pass over alle unmatched transacties. */
export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account") || undefined;
  const result = autoMatchPending(accountId);
  return NextResponse.json(result);
}
