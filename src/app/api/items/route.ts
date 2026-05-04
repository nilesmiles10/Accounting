import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { createItem, listItems } from "@/lib/items";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const sp = request.nextUrl.searchParams;
  const companyId = sp.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "company_id vereist" },
      { status: 400 },
    );
  }
  const activeOnly = sp.get("active") === "1";
  return NextResponse.json({
    items: listItems(companyId, { activeOnly }),
  });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = await request.json();
    if (!body.company_id || !body.name) {
      return NextResponse.json(
        { error: "company_id en name verplicht" },
        { status: 400 },
      );
    }
    const item = createItem(body);
    return NextResponse.json({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    log.error({ scope: "accounting/items", err: msg }, "create item failed");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
