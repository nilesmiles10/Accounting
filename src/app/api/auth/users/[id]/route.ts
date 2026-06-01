import { NextRequest, NextResponse } from "next/server";
import { checkAdmin, getCurrentSession } from "@/lib/auth";
import {
  deleteUser,
  hashPassword,
  loadUsers,
  updateUser,
} from "@/lib/users";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAdmin(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as Partial<{
      role: "admin" | "viewer";
      password: string;
      email: string;
      resetTotp: boolean;
    }>;
    const updates: Record<string, unknown> = {};
    if (body.role === "admin" || body.role === "viewer") {
      updates.role = body.role;
    }
    if (body.email !== undefined) {
      updates.email = body.email || null;
    }
    if (body.password) {
      if (body.password.length < 12) {
        return NextResponse.json(
          { error: "Wachtwoord moet minstens 12 tekens zijn" },
          { status: 400 },
        );
      }
      updates.passwordHash = hashPassword(body.password).hash;
    }
    if (body.resetTotp === true) {
      updates.totpSecret = null;
      updates.totpEnabled = false;
      updates.pendingTotpSecret = null;
      updates.lastTotpCounter = null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Geen wijzigingen opgegeven" },
        { status: 400 },
      );
    }
    const updated = await updateUser(params.id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        role: updated.role,
        totpEnabled: updated.totpEnabled,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bijwerken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAdmin(request);
  if (deny) return deny;
  // Voorkom dat de admin zichzelf verwijdert
  const session = await getCurrentSession(request);
  const { users } = await loadUsers();
  const target = users.find((u) => u.id === params.id);
  if (!target) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  if (session && target.username === session.username) {
    return NextResponse.json(
      { error: "Je kan jezelf niet verwijderen" },
      { status: 400 },
    );
  }
  // Voorkom dat laatste admin verdwijnt
  if (target.role === "admin") {
    const otherAdmins = users.filter(
      (u) => u.role === "admin" && u.id !== params.id,
    );
    if (otherAdmins.length === 0) {
      return NextResponse.json(
        { error: "Laatste admin kan niet verwijderd worden" },
        { status: 400 },
      );
    }
  }
  const ok = await deleteUser(params.id);
  if (!ok) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
