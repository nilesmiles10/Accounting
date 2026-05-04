import { NextRequest, NextResponse } from "next/server";
import { TOTP, Secret } from "otpauth";
import * as QRCode from "qrcode";
import { validateSession, findUser, updateUser } from "@/lib/users";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.cookies.get("nova_accounting_session")?.value;
  const session = await validateSession(token || "");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await findUser(session.username);
  if (!user) {
    return NextResponse.json({ error: "Gebruiker niet gevonden" }, { status: 404 });
  }

  // H2: do not overwrite an already-enabled secret. Admin must disable first.
  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "2FA is al actief — eerst uitschakelen" },
      { status: 400 }
    );
  }

  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "WillemMC",
    label: user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri);

  // Store as PENDING until user proves they scanned it by sending a valid code.
  await updateUser(user.id, { pendingTotpSecret: secret.base32 });

  return NextResponse.json({
    secret: secret.base32,
    qrCode: qrDataUrl,
    uri,
  });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("nova_accounting_session")?.value;
  const session = await validateSession(token || "");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await findUser(session.username);
  if (!user) {
    return NextResponse.json({ error: "Gebruiker niet gevonden" }, { status: 404 });
  }

  await updateUser(user.id, { totpSecret: null, totpEnabled: false, pendingTotpSecret: null });
  return NextResponse.json({ ok: true });
}
