import { NextRequest, NextResponse } from "next/server";
import {
  findUser,
  verifyPassword,
  createSession,
  updateUser,
  ensureDefaultAdmin,
} from "@/lib/users";
import { sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { loginAttempts } from "@/lib/rate-limit/attempts";
import { log } from "@/lib/logger";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await ensureDefaultAdmin();

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Gebruikersnaam en wachtwoord zijn verplicht" },
        { status: 400 }
      );
    }

    // M2: per-(ip+username) sliding-window lockout after 5 fails in 15 min.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const key = `${ip}:${String(username).toLowerCase()}`;
    const blockedFor = loginAttempts.check(key);
    if (blockedFor > 0) {
      return NextResponse.json(
        { error: "Te veel pogingen. Probeer het later opnieuw." },
        { status: 429, headers: { "retry-after": String(Math.ceil(blockedFor / 1000)) } }
      );
    }

    const user = await findUser(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      loginAttempts.recordFailure(key);
      return NextResponse.json(
        { error: "Ongeldige inloggegevens" },
        { status: 401 }
      );
    }
    loginAttempts.clear(key);

    if (user.totpEnabled) {
      const token = await createSession(user.id, user.username, user.role, true);
      const response = NextResponse.json({ ok: true, requires2fa: true });
      response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(300));
      return response;
    }

    const token = await createSession(user.id, user.username, user.role);
    await updateUser(user.id, { lastLogin: Date.now() });

    const response = NextResponse.json({
      ok: true,
      user: { username: user.username, role: user.role },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(60 * 60 * 24 * 30));
    return response;
  } catch (err) {
    // H4: do not leak internal error detail to client
    log.error({ scope: "auth/login", err: err instanceof Error ? err.message : String(err) }, "login failed");
    return NextResponse.json(
      { error: "Login mislukt" },
      { status: 500 }
    );
  }
}
