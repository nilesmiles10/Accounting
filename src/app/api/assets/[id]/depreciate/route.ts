import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { catchupDepreciation } from "@/lib/assets";

export const dynamic = "force-dynamic";

/** Run catch-up afschrijvingen voor 1 asset. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const result = catchupDepreciation(params.id);
  return NextResponse.json(result);
}
