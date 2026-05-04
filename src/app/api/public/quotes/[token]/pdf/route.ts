import { NextRequest, NextResponse } from "next/server";
import { getQuoteByPublicToken } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/pdf/renderQuote";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const quote = getQuoteByPublicToken(params.token);
    if (!quote) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    const pdf = await renderQuotePdf(quote.id);
    const disposition = request.nextUrl.searchParams.get("download")
      ? "attachment"
      : "inline";
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${quote.number}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF mislukt";
    log.error({ scope: "accounting/public-quote-pdf", err: msg }, "pdf failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
