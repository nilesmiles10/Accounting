import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { checkAccountingAccess } from "@/lib/auth";
import { getPurchaseInvoiceWithLines } from "@/lib/purchase-invoices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const PDF_DIR = path.join(DATA_DIR, "accounting", "purchase_pdfs");

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const deny = await checkAccountingAccess(request);
  if (deny) return deny;
  const invoice = getPurchaseInvoiceWithLines(params.id);
  if (!invoice || !invoice.pdf_path) {
    return NextResponse.json({ error: "Geen PDF" }, { status: 404 });
  }
  try {
    const full = path.join(PDF_DIR, path.basename(invoice.pdf_path));
    const ext = path.extname(invoice.pdf_path).toLowerCase();
    const buf = await fs.readFile(full);
    const mimeMap: Record<string, string> = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    const mime = mimeMap[ext] || "application/octet-stream";
    const downloadName = `${invoice.supplier_invoice_number || "factuur"}${ext}`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "private, max-age=60",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return NextResponse.json({ error: "Bestand niet gevonden" }, { status: 404 });
  }
}
