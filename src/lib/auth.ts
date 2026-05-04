import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/users";

/**
 * Shared session cookie options.
 * - `secure` in production: requires HTTPS, prevents MITM token capture.
 * - `httpOnly`: no JS access.
 * - `sameSite: "lax"`: sent on top-level nav, blocked on cross-site POSTs.
 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  const domain = process.env.SESSION_COOKIE_DOMAIN || undefined;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    ...(domain ? { domain } : {}),
  };
}

export const SESSION_COOKIE_NAME = "nova_accounting_session";

/**
 * Session-based auth check. Whole app is accounting-only, geen extra
 * rolcheck nodig — een geldige sessie is voldoende.
 */
export async function checkAuth(
  request: NextRequest,
): Promise<NextResponse | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await validateSession(token || "");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Backward-compat alias zodat bestaande call-sites blijven werken. */
export const checkAccountingAccess = checkAuth;
