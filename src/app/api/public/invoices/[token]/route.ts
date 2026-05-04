import { NextRequest, NextResponse } from "next/server";
import {
  getInvoiceByPublicToken,
  getRenderContext,
} from "@/lib/invoices";

export const dynamic = "force-dynamic";

/** Publieke factuur-view: uitgedunde JSON, geen interne IDs. */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  const invoice = getInvoiceByPublicToken(params.token);
  if (!invoice) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  const { company, client } = getRenderContext(invoice);
  return NextResponse.json({
    invoice: {
      number: invoice.number,
      status: invoice.status,
      language: invoice.language,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      total_cents: invoice.total_cents,
      currency: invoice.currency,
      mollie_payment_url: invoice.mollie_payment_url,
      mollie_status: invoice.mollie_status,
      paid_at: invoice.paid_at,
    },
    company: {
      name: company.name,
      email: company.email,
      phone: company.phone,
      accent_color: company.accent_color,
    },
    client: { name: client.name },
  });
}
