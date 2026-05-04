import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  createPurchaseInvoice,
  listPurchaseInvoices,
  type PurchaseStatus,
} from "@/lib/purchase-invoices";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const sp = request.nextUrl.searchParams;
  const status = (sp.get("status") || undefined) as PurchaseStatus | undefined;
  const company_id = sp.get("company_id") || undefined;
  const supplier_id = sp.get("supplier_id") || undefined;
  return NextResponse.json({
    invoices: listPurchaseInvoices({ status, company_id, supplier_id }),
  });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = await request.json();
    if (!body.company_id) {
      return NextResponse.json(
        { error: "company_id is verplicht" },
        { status: 400 },
      );
    }
    const invoice = createPurchaseInvoice(body);
    return NextResponse.json({ invoice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    log.error({ scope: "accounting/purchase", err: msg }, "create failed");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
