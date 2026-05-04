import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/users";

export const dynamic = 'force-dynamic';

/**
 * L3/L4: CSRF on logout is already mitigated by two properties:
 *   1. POST-only (GET cannot log out a user via <img> / <a> tag attacks)
 *   2. session cookie uses SameSite: "lax" (H1), so cross-site POST doesn't
 *      include the cookie — no session, no-op.
 * We also require a same-origin Origin/Referer header as a belt-and-braces
 * check for browsers with unusual cookie policies.
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!origin) return true; // server-to-server / curl — no cross-origin risk
  try {
    const u = new URL(origin);
    const host = req.headers.get("host");
    return host ? u.host === host : true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const token = request.cookies.get("nova_accounting_session")?.value;
  if (token) await deleteSession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("nova_accounting_session");
  response.cookies.delete("wmc_auth");
  return response;
}
