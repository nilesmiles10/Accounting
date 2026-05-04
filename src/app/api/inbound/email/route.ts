import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { listCompanies } from "@/lib/companies";
import { createPurchaseInvoice } from "@/lib/purchase-invoices";
import { ocrPurchaseInvoice } from "@/lib/ocr/apply";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const PDF_DIR = path.join(DATA_DIR, "accounting", "purchase_pdfs");

interface PostmarkAttachment {
  Name: string;
  Content: string; // base64
  ContentType: string;
  ContentLength: number;
}

interface PostmarkInbound {
  From: string;
  FromName?: string;
  To: string;
  Subject: string;
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: PostmarkAttachment[];
  Headers?: Array<{ Name: string; Value: string }>;
  MessageID?: string;
}

/**
 * Postmark Inbound webhook. Verwerkt elke ontvangen mail:
 *  1. Filter op PDF-attachments
 *  2. Per PDF: maak purchase_invoice + sla op + run OCR
 *  3. Routing via "+" extension in To-adres:
 *     facturen+intersumma@inbound... → company.id = "intersumma"
 *     Geen extension → eerste bedrijf
 *
 * Auth: geen header (Postmark stuurt vanuit hun servers). Optioneel:
 * INBOUND_SECRET in env + ?key=... query param voor extra zekerheid.
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.ACCOUNTING_INBOUND_SECRET;
  if (expectedSecret) {
    const provided = request.nextUrl.searchParams.get("key");
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: PostmarkInbound;
  try {
    body = (await request.json()) as PostmarkInbound;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const companies = listCompanies();
  if (companies.length === 0) {
    log.warn(
      { scope: "accounting/inbound" },
      "geen bedrijven — kan inkomende mail niet routeren",
    );
    return new NextResponse("ok", { status: 200 });
  }

  // Routing op "+extension" in lokale deel van To
  const to = (body.To || "").toLowerCase();
  const m = to.match(/^[^@+]+\+([^@]+)@/);
  let companyId = companies[0]!.id;
  if (m) {
    const slug = m[1]!.toLowerCase();
    const matched = companies.find(
      (c) =>
        c.id.toLowerCase() === slug ||
        c.name.toLowerCase().replace(/\s+/g, "") === slug,
    );
    if (matched) companyId = matched.id;
  }

  const pdfs = (body.Attachments || []).filter(
    (a) => a.ContentType === "application/pdf" && a.Content,
  );

  if (pdfs.length === 0) {
    log.info(
      {
        scope: "accounting/inbound",
        from: body.From,
        subject: body.Subject,
      },
      "inkomende mail zonder PDF — genegeerd",
    );
    return new NextResponse("ok", { status: 200 });
  }

  await fs.mkdir(PDF_DIR, { recursive: true });
  const created: string[] = [];

  for (const att of pdfs) {
    try {
      const filename = `${crypto.randomUUID()}.pdf`;
      const fullPath = path.join(PDF_DIR, filename);
      await fs.writeFile(fullPath, Buffer.from(att.Content, "base64"));

      const invoice = createPurchaseInvoice({
        company_id: companyId,
        pdf_path: filename,
        source: "email",
        source_email_subject: body.Subject || att.Name,
        source_email_from: body.From,
      });

      // OCR sync — kan 5-15 sec duren maar Postmark accepteert lange responses
      try {
        await ocrPurchaseInvoice(invoice.id);
      } catch (err) {
        log.error(
          {
            scope: "accounting/inbound",
            invoice_id: invoice.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "OCR via inbound faalde — factuur staat in draft",
        );
      }
      created.push(invoice.id);
    } catch (err) {
      log.error(
        {
          scope: "accounting/inbound",
          err: err instanceof Error ? err.message : String(err),
          attachment: att.Name,
        },
        "verwerken attachment faalde",
      );
    }
  }

  log.info(
    {
      scope: "accounting/inbound",
      from: body.From,
      subject: body.Subject,
      company_id: companyId,
      invoices_created: created.length,
    },
    "inkomende mail verwerkt",
  );

  return new NextResponse("ok", { status: 200 });
}

export async function GET() {
  return new NextResponse("ok", { status: 200 });
}
