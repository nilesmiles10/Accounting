import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  submitVatQuarter,
  type Quarter,
} from "@/lib/ledger/periods";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      year: number;
      quarter: Quarter;
      paid_date: string;
      bank_account_code?: string;
    };
    if (!body.year || !body.quarter || !body.paid_date) {
      return NextResponse.json(
        { error: "year, quarter en paid_date zijn verplicht" },
        { status: 400 },
      );
    }
    const result = submitVatQuarter({
      year: body.year,
      quarter: body.quarter,
      paid_date: body.paid_date,
      bank_account_code: body.bank_account_code,
    });
    return NextResponse.json({ submission: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aangifte mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
