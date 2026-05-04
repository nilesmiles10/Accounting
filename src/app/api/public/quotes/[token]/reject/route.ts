import { NextRequest, NextResponse } from "next/server";
import {
  rejectQuoteByToken,
  getQuoteByPublicToken,
} from "@/lib/quotes";
import { notifyQuoteRejected } from "@/lib/email/quoteMail";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const reason = body.reason ? String(body.reason).trim() : null;
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Vul je naam in (min. 2 tekens)" },
        { status: 400 },
      );
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const existingStatus = getQuoteByPublicToken(params.token)?.status;
    const quote = rejectQuoteByToken(params.token, name, reason, ip);

    if (existingStatus === "sent") {
      try {
        await notifyQuoteRejected(quote.id);
      } catch (err) {
        log.error(
          { scope: "accounting/quote-notify", err: err instanceof Error ? err.message : String(err) },
          "owner reject-notification failed",
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Afwijzen mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
