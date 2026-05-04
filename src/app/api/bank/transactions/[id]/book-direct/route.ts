import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { bookTransactionDirect } from "@/lib/bank/match";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      account_code: string;
      description?: string;
      vat_code?: string | null;
    };
    if (!body.account_code) {
      return NextResponse.json(
        { error: "account_code verplicht" },
        { status: 400 },
      );
    }
    const result = bookTransactionDirect({
      transaction_id: params.id,
      account_code: body.account_code,
      description: body.description,
      vat_code: body.vat_code ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Boeking mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
