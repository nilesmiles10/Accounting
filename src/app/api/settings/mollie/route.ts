import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import {
  getMollieSettings,
  setMollieSettings,
} from "@/lib/mollie";

export const dynamic = "force-dynamic";

function mask(t: string): string {
  if (!t) return "";
  if (t.length <= 8) return "•".repeat(t.length);
  return `${t.slice(0, 5)}${"•".repeat(t.length - 9)}${t.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const s = getMollieSettings();
  return NextResponse.json({
    hasKey: !!s.api_key,
    keyPreview: s.api_key ? mask(s.api_key) : "",
    keyType: s.api_key.startsWith("live_")
      ? "live"
      : s.api_key.startsWith("test_")
        ? "test"
        : "unknown",
    test_mode: s.test_mode,
    description_template: s.description_template,
  });
}

export async function PATCH(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = await request.json();
    const current = getMollieSettings();
    const next = {
      api_key:
        typeof body.api_key === "string" && body.api_key.trim()
          ? body.api_key.trim()
          : current.api_key,
      test_mode:
        typeof body.test_mode === "boolean"
          ? body.test_mode
          : current.test_mode,
      description_template:
        typeof body.description_template === "string"
          ? body.description_template
          : current.description_template,
    };
    setMollieSettings(next);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Opslaan mislukt" }, { status: 400 });
  }
}
