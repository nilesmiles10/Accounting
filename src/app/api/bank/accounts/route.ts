import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  createBankAccount,
  listBankAccounts,
  type BankProvider,
} from "@/lib/bank/accounts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  return NextResponse.json({ accounts: listBankAccounts() });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      account_code: string;
      provider: BankProvider;
      display_name: string;
      iban?: string | null;
      company_id?: string | null;
    };
    if (!body.account_code || !body.provider || !body.display_name) {
      return NextResponse.json(
        { error: "account_code, provider en display_name zijn verplicht" },
        { status: 400 },
      );
    }
    const account = createBankAccount({
      account_code: body.account_code,
      provider: body.provider,
      display_name: body.display_name,
      iban: body.iban,
      company_id: body.company_id,
    });
    return NextResponse.json({ account });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
