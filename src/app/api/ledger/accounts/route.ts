import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  createAccount,
  listAccounts,
  type AccountType,
} from "@/lib/ledger/accounts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") as AccountType | null;
  return NextResponse.json({
    accounts: listAccounts({ type: type || undefined }),
  });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = await request.json();
    if (!body.code || !body.name || !body.type) {
      return NextResponse.json(
        { error: "code, name, type verplicht" },
        { status: 400 },
      );
    }
    const account = createAccount(body);
    return NextResponse.json({ account });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
