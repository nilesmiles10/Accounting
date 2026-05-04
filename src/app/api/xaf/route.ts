import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { generateXaf } from "@/lib/reports/xaf";

export const dynamic = "force-dynamic";

/**
 * GET /api/xaf?year=2026&company=intersumma
 * Returnt XML download met content-disposition zodat browser 'm opslaat.
 */
export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const year = yearParam
    ? parseInt(yearParam)
    : new Date().getFullYear();
  if (!year || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "Ongeldig jaar" },
      { status: 400 },
    );
  }
  const companyId = searchParams.get("company") || undefined;

  try {
    const xml = generateXaf(year, companyId);
    const filename = `XAF-${year}${companyId ? `-${companyId}` : ""}.xaf`;
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "XAF generatie mislukt";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
