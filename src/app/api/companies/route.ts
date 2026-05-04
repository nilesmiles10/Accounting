import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkAccountingAccess } from "@/lib/auth";
import { createCompany, listCompanies } from "@/lib/companies";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  return NextResponse.json({ companies: listCompanies() });
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

    const id = slugify(name) || crypto.randomUUID().slice(0, 8);
    const company = createCompany({ id, name });
    return NextResponse.json({ company });
  } catch (err) {
    log.error(
      {
        scope: "accounting/companies",
        err: err instanceof Error ? err.message : String(err),
      },
      "create company failed",
    );
    return NextResponse.json(
      { error: "Aanmaken mislukt" },
      { status: 500 },
    );
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}
