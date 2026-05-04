import { NextRequest, NextResponse } from "next/server";
import { TOTP, Secret } from "otpauth";
import { findUser, getSession, upgradeSession, updateUser } from "@/lib/users";
import { sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { code, action } = await request.json();
  const token = request.cookies.get("nova_accounting_session")?.value;

  if (!token || !code) {
    return NextResponse.json({ error: "Code en sessie zijn verplicht" }, { status: 400 });
  }

  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ error: "Ongeldige sessie" }, { status: 401 });
  }

  const user = await findUser(session.username);
  if (!user) {
    return NextResponse.json({ error: "2FA niet geconfigureerd" }, { status: 400 });
  }

  // H2: enrollment verifies against pendingTotpSecret; login verifies against totpSecret.
  const isEnrolling = action === "enable";
  const secretB32 = isEnrolling ? user.pendingTotpSecret : user.totpSecret;
  if (!secretB32) {
    return NextResponse.json({ error: "2FA niet geconfigureerd" }, { status: 400 });
  }

  const totp = new TOTP({
    issuer: "WillemMC",
    label: user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretB32),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return NextResponse.json({ error: "Ongeldige code" }, { status: 401 });
  }

  // M3: prevent replay within the ±1 window — each counter used at most once.
  const counter = Math.floor(Date.now() / 1000 / 30) + delta;
  if (!isEnrolling && user.lastTotpCounter != null && counter <= user.lastTotpCounter) {
    return NextResponse.json({ error: "Code al gebruikt" }, { status: 401 });
  }

  if (isEnrolling) {
    // Promote pending → active, clear pending, seed last-counter.
    await updateUser(user.id, {
      totpSecret: secretB32,
      totpEnabled: true,
      pendingTotpSecret: null,
      lastTotpCounter: counter,
    });
    return NextResponse.json({ ok: true, message: "2FA ingeschakeld" });
  }

  await upgradeSession(token);
  await updateUser(user.id, { lastLogin: Date.now(), lastTotpCounter: counter });

  const response = NextResponse.json({
    ok: true,
    user: { username: user.username, role: user.role },
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(60 * 60 * 24 * 30));
  return response;
}
