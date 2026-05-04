import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { getEmailSettings, setEmailSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  const s = getEmailSettings();
  // Mask token for display — only return last 4 chars + length.
  const token = s.postmark_server_token;
  return NextResponse.json({
    hasToken: !!token,
    tokenPreview: token ? maskToken(token) : "",
    test_mode: s.test_mode,
  });
}

export async function PATCH(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const body = await request.json();
    const current = getEmailSettings();
    const next = {
      postmark_server_token:
        typeof body.postmark_server_token === "string"
          ? body.postmark_server_token.trim()
          : current.postmark_server_token,
      test_mode:
        typeof body.test_mode === "boolean"
          ? body.test_mode
          : current.test_mode,
    };
    setEmailSettings(next);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Opslaan mislukt" }, { status: 400 });
  }
}

function maskToken(t: string): string {
  if (t.length <= 8) return "•".repeat(t.length);
  return `${"•".repeat(Math.max(0, t.length - 4))}${t.slice(-4)}`;
}
