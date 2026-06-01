import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentSession,
} from "@/lib/auth";
import {
  findUser,
  hashPassword,
  updateUser,
  verifyPassword,
} from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getCurrentSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await findUser(session.username);
  if (!user) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      totpEnabled: user.totpEnabled,
    },
  });
}

/**
 * Self-service password change. User moet huidig wachtwoord opgeven —
 * dat is anti-CSRF voor het geval een aanvaller een sessie heeft
 * gekaapt. Email mag ook bijgewerkt worden zonder her-auth.
 */
export async function PATCH(request: NextRequest) {
  const session = await getCurrentSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Partial<{
      current_password: string;
      new_password: string;
      email: string;
    }>;
    const user = await findUser(session.username);
    if (!user) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    const updates: Record<string, unknown> = {};

    if (body.email !== undefined) {
      updates.email = body.email || null;
    }
    if (body.new_password) {
      if (!body.current_password) {
        return NextResponse.json(
          { error: "Huidig wachtwoord vereist om te wijzigen" },
          { status: 400 },
        );
      }
      if (!verifyPassword(body.current_password, user.passwordHash)) {
        return NextResponse.json(
          { error: "Huidig wachtwoord klopt niet" },
          { status: 400 },
        );
      }
      if (body.new_password.length < 12) {
        return NextResponse.json(
          { error: "Wachtwoord moet minstens 12 tekens zijn" },
          { status: 400 },
        );
      }
      updates.passwordHash = hashPassword(body.new_password).hash;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Geen wijzigingen opgegeven" },
        { status: 400 },
      );
    }
    await updateUser(user.id, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bijwerken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
