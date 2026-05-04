import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  createQuoteDraft,
  listQuotes,
  type QuoteStatus,
} from "@/lib/quotes";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  const sp = request.nextUrl.searchParams;
  const status = (sp.get("status") || undefined) as
    | QuoteStatus
    | "open"
    | undefined;
  const company_id = sp.get("company_id") || undefined;
  const client_id = sp.get("client_id") || undefined;
  return NextResponse.json({
    quotes: listQuotes({ status, company_id, client_id }),
  });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const body = await request.json();
    if (!body.company_id || !body.client_id) {
      return NextResponse.json(
        { error: "company_id en client_id zijn verplicht" },
        { status: 400 },
      );
    }
    const quote = createQuoteDraft(body);
    return NextResponse.json({ quote });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    log.error({ scope: "accounting/quotes", err: msg }, "create quote failed");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
