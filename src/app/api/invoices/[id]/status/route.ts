import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { cancelInvoice, markPaid } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/:id/status  body: { action: "paid" | "cancel" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const { action } = await request.json();
    let invoice;
    if (action === "paid") invoice = markPaid(params.id);
    else if (action === "cancel") invoice = cancelInvoice(params.id);
    else {
      return NextResponse.json(
        { error: "Onbekende actie" },
        { status: 400 },
      );
    }
    if (!invoice) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Actie mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
