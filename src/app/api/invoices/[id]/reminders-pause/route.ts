import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      paused?: boolean;
    };
    const paused = body.paused === true ? 1 : 0;
    const db = getDb();
    const now = Date.now();
    const res = db
      .prepare(
        `UPDATE invoices SET reminders_paused = ?, updated_at = ? WHERE id = ?`,
      )
      .run(paused, now, params.id);
    if (res.changes === 0) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    db.prepare(
      `INSERT INTO invoice_events (id, invoice_id, type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      params.id,
      paused ? "reminders_paused" : "reminders_resumed",
      JSON.stringify({}),
      now,
    );
    return NextResponse.json({ ok: true, paused: paused === 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bijwerken mislukt";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
