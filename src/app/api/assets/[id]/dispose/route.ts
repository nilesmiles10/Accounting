import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { disposeAsset } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      disposal_date: string;
      disposal_amount_cents: number;
      bank_account_code?: string;
    };
    if (!body.disposal_date) {
      return NextResponse.json(
        { error: "disposal_date verplicht" },
        { status: 400 },
      );
    }
    const result = disposeAsset({
      asset_id: params.id,
      disposal_date: body.disposal_date,
      disposal_amount_cents: body.disposal_amount_cents || 0,
      bank_account_code: body.bank_account_code,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Afstoting mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
