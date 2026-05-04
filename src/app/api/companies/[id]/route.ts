import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  deleteCompany,
  getCompany,
  updateCompany,
  type CompanyUpdate,
} from "@/lib/companies";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const company = getCompany(params.id);
  if (!company) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({ company });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const body = (await request.json()) as CompanyUpdate;
    const company = updateCompany(params.id, body);
    if (!company) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ company });
  } catch (err) {
    log.error(
      {
        scope: "accounting/companies",
        err: err instanceof Error ? err.message : String(err),
      },
      "update company failed",
    );
    return NextResponse.json(
      { error: "Bijwerken mislukt" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const ok = deleteCompany(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verwijderen mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
