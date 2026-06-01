import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { createUser, loadUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAdmin(request);
  if (deny) return deny;
  const { users } = await loadUsers();
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      totpEnabled: u.totpEnabled,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
    })),
  });
}

export async function POST(request: NextRequest) {
  const deny = await checkAdmin(request);
  if (deny) return deny;
  try {
    const body = (await request.json()) as {
      username: string;
      password: string;
      email?: string;
      role?: "admin" | "viewer";
    };
    if (!body.username || !body.password) {
      return NextResponse.json(
        { error: "username en password verplicht" },
        { status: 400 },
      );
    }
    if (body.password.length < 12) {
      return NextResponse.json(
        { error: "Wachtwoord moet minstens 12 tekens zijn" },
        { status: 400 },
      );
    }
    const user = await createUser(
      body.username.trim(),
      body.password,
      body.role || "viewer",
    );
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        totpEnabled: user.totpEnabled,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aanmaken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
