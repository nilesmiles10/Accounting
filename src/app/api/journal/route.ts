import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { post } from "@/lib/ledger/journal";

export const dynamic = "force-dynamic";

/**
 * Handmatige journaalpost. Gebruikt voor:
 *   - Correcties
 *   - Openingsbalans (source_type=opening)
 *   - Jaarafsluiting (resultaat-overboeking naar EV)
 *   - Herwaarderingen
 *
 * Validatie (sum debit = sum credit, periode niet gesloten, regels > 1)
 * gebeurt in post(); deze route is een dunne wrapper.
 */
export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      date: string;
      description: string;
      source_type?: "manual" | "opening";
      company_id?: string | null;
      notes?: string | null;
      lines: Array<{
        account_code: string;
        description?: string | null;
        debit_cents?: number;
        credit_cents?: number;
        vat_code?: string | null;
      }>;
    };
    if (!body.date || !body.description) {
      return NextResponse.json(
        { error: "datum en omschrijving zijn verplicht" },
        { status: 400 },
      );
    }
    if (!body.lines || body.lines.length < 2) {
      return NextResponse.json(
        { error: "minstens 2 regels (debet + credit) nodig" },
        { status: 400 },
      );
    }
    const entry = post({
      date: body.date,
      description: body.description,
      source_type: body.source_type === "opening" ? "opening" : "manual",
      company_id: body.company_id || null,
      notes: body.notes ?? null,
      created_by: "user",
      lines: body.lines.map((l) => ({
        account_code: l.account_code,
        description: l.description ?? null,
        debit_cents: l.debit_cents || 0,
        credit_cents: l.credit_cents || 0,
        vat_code: l.vat_code ?? null,
      })),
    });
    return NextResponse.json({ entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Boeking mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
