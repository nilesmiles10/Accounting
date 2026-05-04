import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { syncBankAccount } from "@/lib/bank/sync";

export const dynamic = "force-dynamic";

/**
 * Trigger sync voor een bank-account. Voor providers met API-koppeling
 * (paypal, gocardless). Voor camt_upload geeft 'ie een fout — daar
 * upload je via /api/bank/upload.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      lookback_days?: number;
    };
    const result = await syncBankAccount(params.id, {
      lookbackDays: body.lookback_days,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...result },
        { status: 400 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync mislukt";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
