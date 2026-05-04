import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  reopenQuarter,
  type Quarter,
} from "@/lib/ledger/periods";

export const dynamic = "force-dynamic";

/**
 * Heropent een gesloten BTW-kwartaal. Alleen voor noodgevallen — als je
 * dit doet vóór indienen bij Belastingdienst is het OK, na indienen
 * hoort het via suppletie. UI waarschuwt hiervoor.
 */
export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      year: number;
      quarter: Quarter;
    };
    if (!body.year || !body.quarter) {
      return NextResponse.json(
        { error: "year en quarter zijn verplicht" },
        { status: 400 },
      );
    }
    reopenQuarter(body.year, body.quarter);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Heropenen mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
