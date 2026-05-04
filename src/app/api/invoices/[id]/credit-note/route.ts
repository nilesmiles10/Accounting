import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { createCreditNoteFromInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/**
 * Maak draft-creditnota aan voor een bestaande factuur. Klant ontvangt
 * 'm pas als de gebruiker 'm finaliseert (eigen flow op de invoice
 * editor). Tot die tijd kunnen lijnen aangepast worden voor partial
 * credits.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const draft = createCreditNoteFromInvoice(params.id);
    return NextResponse.json({ invoice: draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Creditnota maken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
