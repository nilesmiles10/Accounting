import { NextRequest, NextResponse } from "next/server";
import { getInvoiceByPublicToken } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/pdf/render";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const invoice = getInvoiceByPublicToken(params.token);
    if (!invoice) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    const pdf = await renderInvoicePdf(invoice.id);
    const disposition = request.nextUrl.searchParams.get("download")
      ? "attachment"
      : "inline";
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${invoice.number}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF mislukt";
    log.error(
      { scope: "accounting/public-invoice-pdf", err: msg },
      "pdf failed",
    );
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
