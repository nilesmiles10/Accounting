import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { getQuoteWithLines } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/pdf/renderQuote";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const quote = getQuoteWithLines(params.id);
    if (!quote)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

    const pdf = await renderQuotePdf(params.id);
    const disposition = request.nextUrl.searchParams.get("download")
      ? "attachment"
      : "inline";
    const filename =
      quote.status === "draft"
        ? `concept-offerte-${params.id.slice(0, 8)}.pdf`
        : `${quote.number}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF mislukt";
    log.error({ scope: "accounting/quote-pdf", err: msg }, "pdf failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
