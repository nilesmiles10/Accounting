import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { createSupplier, listSuppliers } from "@/lib/suppliers";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const search = request.nextUrl.searchParams.get("q") || undefined;
  return NextResponse.json({ suppliers: listSuppliers(search) });
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
    const supplier = createSupplier({ name, ...body });
    return NextResponse.json({ supplier });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    log.error({ scope: "accounting/suppliers", err: msg }, "create failed");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
