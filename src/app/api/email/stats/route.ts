import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { getPostmarkStats } from "@/lib/email/postmarkStats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const messageId = request.nextUrl.searchParams.get("message_id");
  if (!messageId) {
    return NextResponse.json({ error: "message_id vereist" }, { status: 400 });
  }
  const stats = await getPostmarkStats(messageId);
  if (!stats) {
    return NextResponse.json(
      { error: "Stats niet beschikbaar (token niet gezet of Postmark-fout)" },
      { status: 404 },
    );
  }
  return NextResponse.json({ stats });
}
