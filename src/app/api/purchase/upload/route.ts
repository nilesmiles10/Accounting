import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { createPurchaseInvoice } from "@/lib/purchase-invoices";
import { ocrPurchaseInvoice } from "@/lib/ocr/apply";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const PDF_DIR = path.join(DATA_DIR, "accounting", "purchase_pdfs");
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — facturen zijn meestal <2 MB

// Claude Vision support: PDF + JPEG/PNG/WEBP/GIF.
const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(request: NextRequest) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;

  try {
    const form = await request.formData();
    const file = form.get("pdf");
    const company_id = String(form.get("company_id") || "");
    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is verplicht" },
        { status: 400 },
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Geen bestand ontvangen" },
        { status: 400 },
      );
    }
    const ext = ALLOWED_MIME[file.type];
    if (!ext) {
      return NextResponse.json(
        {
          error:
            "Niet-ondersteund bestandstype. Gebruik PDF, JPG, PNG, WEBP of GIF. " +
            (file.type === "image/heic" || file.type === "image/heif"
              ? "iPhone-foto (HEIC) wordt niet ondersteund — zet Camera op 'Meest compatibel' in iOS Instellingen om JPG-foto's te krijgen."
              : ""),
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Bestand te groot (max 15 MB)" },
        { status: 400 },
      );
    }

    await fs.mkdir(PDF_DIR, { recursive: true });
    const filename = `${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(PDF_DIR, filename);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(fullPath, bytes);

    const invoice = createPurchaseInvoice({
      company_id,
      pdf_path: filename,
      source: "upload",
      source_email_subject: file.name,
    });

    // OCR sync runnen — duurt 5-15 sec maar geeft direct gevulde review-page.
    // Bij fout: factuur blijft in 'draft' met pdf, gebruiker kan handmatig
    // doorgaan of opnieuw OCR-en.
    let ocrResult: { confidence: number } | null = null;
    try {
      const r = await ocrPurchaseInvoice(invoice.id);
      ocrResult = { confidence: r.confidence };
    } catch (err) {
      log.warn(
        {
          scope: "accounting/purchase-upload",
          invoice_id: invoice.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "OCR fase faalde — factuur staat klaar voor handmatig invullen",
      );
    }

    return NextResponse.json({ invoice, ocr: ocrResult });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload mislukt";
    log.error({ scope: "accounting/purchase-upload", err: msg }, "upload failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
