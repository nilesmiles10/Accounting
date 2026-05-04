import fs from "fs";
import path from "path";
import React, { type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoiceDocument } from "./InvoiceDocument";
import { getInvoiceWithLines, getRenderContext } from "@/lib/invoices";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const LOGOS_DIR = path.join(DATA_DIR, "accounting", "logos");

/**
 * Render an invoice to a PDF Buffer. Loads company logo from disk and
 * converts to a data URL so react-pdf can embed it without a network fetch.
 */
export async function renderInvoicePdf(invoiceId: string): Promise<Buffer> {
  const invoice = getInvoiceWithLines(invoiceId);
  if (!invoice) throw new Error("Factuur bestaat niet");
  const { company, client } = getRenderContext(invoice);

  const logoDataUrl = company.logo_path
    ? loadLogoAsDataUrl(company.logo_path)
    : null;

  const element = React.createElement(InvoiceDocument, {
    invoice,
    company,
    client,
    logoDataUrl,
  }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

function loadLogoAsDataUrl(relPath: string): string | null {
  try {
    const full = path.join(LOGOS_DIR, path.basename(relPath));
    if (!fs.existsSync(full)) return null;
    const buf = fs.readFileSync(full);
    const ext = path.extname(full).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
