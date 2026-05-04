import { NextRequest, NextResponse } from "next/server";
import {
  getQuoteByPublicToken,
  getQuoteRenderContext,
} from "@/lib/quotes";

export const dynamic = "force-dynamic";

/**
 * Publieke quote-ophaler — geen auth, token is het geheim. Returnt een
 * uitgedunde JSON: regels, bedragen, bedrijf + klant uit snapshot. Geen
 * interne IDs, geen events.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  const quote = getQuoteByPublicToken(params.token);
  if (!quote) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  const { company, client } = getQuoteRenderContext(quote);
  return NextResponse.json({
    quote: {
      number: quote.number,
      status: quote.status,
      language: quote.language,
      issue_date: quote.issue_date,
      valid_until_date: quote.valid_until_date,
      subtotal_cents: quote.subtotal_cents,
      vat_total_cents: quote.vat_total_cents,
      total_cents: quote.total_cents,
      vat_treatment: quote.vat_treatment,
      reference: quote.reference,
      notes: quote.notes,
      terms_text: quote.terms_text,
      signature_line: quote.signature_line,
      accepted_by_name: quote.accepted_by_name,
      rejected_by_name: quote.rejected_by_name,
      lines: quote.lines.map((l) => ({
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
        unit_price_cents: l.unit_price_cents,
        vat_rate: l.vat_rate,
        line_total_cents: l.line_total_cents,
      })),
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
