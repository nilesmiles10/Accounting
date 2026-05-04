import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { createClient, listClients } from "@/lib/clients";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const search = request.nextUrl.searchParams.get("q") || undefined;
  return NextResponse.json({ clients: listClients(search) });
}

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });
    }
    const client = createClient({ name, ...body });
    return NextResponse.json({ client });
  } catch (err) {
    log.error(
      {
        scope: "accounting/clients",
        err: err instanceof Error ? err.message : String(err),
      },
      "create client failed",
    );
    return NextResponse.json({ error: "Aanmaken mislukt" }, { status: 500 });
  }
}
