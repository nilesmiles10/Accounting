import { NextRequest, NextResponse } from "next/server";
import { validateSession, ensureDefaultAdmin } from "@/lib/users";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await ensureDefaultAdmin();

  const token = request.cookies.get("nova_accounting_session")?.value;
  const session = await validateSession(token || "");
  if (!session) {
    // Clear any lingering legacy cookie
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    res.cookies.delete("wmc_auth");
    return res;
  }

  return NextResponse.json({
    ok: true,
    user: { username: session.username, role: session.role },
  });
}
