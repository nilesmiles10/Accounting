import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { acceptQuote, rejectQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";

/** POST body: { action: "accept" | "reject" } */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const { action } = await request.json();
    let quote;
    if (action === "accept") quote = acceptQuote(params.id);
    else if (action === "reject") quote = rejectQuote(params.id);
    else
      return NextResponse.json(
        { error: "Onbekende actie" },
        { status: 400 },
      );
    if (!quote)
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    return NextResponse.json({ quote });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Actie mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
