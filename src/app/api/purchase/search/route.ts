import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { listPurchaseInvoices } from "@/lib/purchase-invoices";

export const dynamic = "force-dynamic";

/**
 * Zoek inkoopfacturen voor handmatige bank-koppeling. Filter op
 * status=approved (alleen openstaand). Match op:
 *   - supplier_invoice_number (substring)
 *   - supplier_name (substring)
 *   - total_cents (exact, optionaal — meestal nuttig)
 */
export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const amountParam = searchParams.get("amount_cents");
  const amount = amountParam ? parseInt(amountParam, 10) : null;

  // Default: openstaande inkoopfacturen
  const all = listPurchaseInvoices({ status: "approved" });
  const filtered = all.filter((p) => {
    if (
      amount !== null &&
      Number.isFinite(amount) &&
      Math.abs(p.total_cents - amount) > 1
    ) {
      return false;
    }
    if (!q) return true;
    const hay =
      `${p.supplier_invoice_number || ""} ${p.supplier_name || ""}`.toLowerCase();
    return hay.includes(q);
  });

  return NextResponse.json({
    results: filtered.slice(0, 20).map((p) => ({
      id: p.id,
      supplier_invoice_number: p.supplier_invoice_number,
      supplier_name: p.supplier_name,
      issue_date: p.issue_date,
      total_cents: p.total_cents,
      due_date: p.due_date,
    })),
    total: filtered.length,
  });
}
