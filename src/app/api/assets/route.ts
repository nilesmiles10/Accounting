import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  createAsset,
  listAssets,
  catchupAll,
  type AssetCategory,
} from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as
    | "active"
    | "fully_depreciated"
    | "disposed"
    | null;
  const assets = listAssets({ status: status || undefined });
  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      code: string;
      name: string;
      description?: string | null;
      category: AssetCategory;
      purchase_date: string;
      purchase_amount_cents: number;
      purchase_invoice_id?: string | null;
      useful_life_years?: number;
      residual_value_cents?: number;
      asset_account_code?: string;
      depreciation_account_code?: string;
      expense_account_code?: string;
      company_id?: string | null;
    };
    const asset = createAsset(body);
    // Direct catch-up zodat alle gemiste maand-afschrijvingen meteen
    // geboekt zijn.
    catchupAll();
    return NextResponse.json({ asset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
