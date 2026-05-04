import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { getCompany, updateCompany } from "@/lib/companies";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const LOGOS_DIR = path.join(DATA_DIR, "accounting", "logos");
const ALLOWED = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
]);
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const company = getCompany(params.id);
    if (!company) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Geen bestand ontvangen" },
        { status: 400 },
      );
    }

    const ext = ALLOWED.get(file.type);
    if (!ext) {
      return NextResponse.json(
        { error: "Alleen PNG, JPG of GIF toegestaan" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Bestand te groot (max 2 MB)" },
        { status: 400 },
      );
    }

    await fs.mkdir(LOGOS_DIR, { recursive: true });
    const filename = `${params.id}-${Date.now()}${ext}`;
    const full = path.join(LOGOS_DIR, filename);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(full, bytes);

    // Remove previous logo if any.
    if (company.logo_path && company.logo_path !== filename) {
      try {
        await fs.unlink(path.join(LOGOS_DIR, path.basename(company.logo_path)));
      } catch {
        /* ignore */
      }
    }

    updateCompany(params.id, { logo_path: filename });
    return NextResponse.json({ logo_path: filename });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload mislukt";
    log.error({ scope: "accounting/logo", err: msg }, "logo upload failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  const company = getCompany(params.id);
  if (!company) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
  if (company.logo_path) {
    try {
      await fs.unlink(path.join(LOGOS_DIR, path.basename(company.logo_path)));
    } catch {
      /* ignore */
    }
  }
  updateCompany(params.id, { logo_path: null });
  return NextResponse.json({ ok: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  const company = getCompany(params.id);
  if (!company || !company.logo_path) {
    return NextResponse.json({ error: "Geen logo" }, { status: 404 });
  }
  try {
    const full = path.join(LOGOS_DIR, path.basename(company.logo_path));
    const buf = await fs.readFile(full);
    const ext = path.extname(full).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }
}
