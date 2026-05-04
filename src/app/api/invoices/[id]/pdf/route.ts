import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { getInvoiceWithLines } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/pdf/render";
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
    const invoice = getInvoiceWithLines(params.id);
    if (!invoice) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    const pdf = await renderInvoicePdf(params.id);
    const disposition = request.nextUrl.searchParams.get("download")
      ? "attachment"
      : "inline";
    const filename =
      invoice.status === "draft"
        ? `concept-${params.id.slice(0, 8)}.pdf`
        : `${invoice.number}.pdf`;

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
    const msg = err instanceof Error ? err.message : "PDF genereren mislukt";
    log.error({ scope: "accounting/pdf", err: msg }, "pdf render failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
