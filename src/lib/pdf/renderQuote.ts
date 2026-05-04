import fs from "fs";
import path from "path";
import React, { type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { QuoteDocument } from "./QuoteDocument";
import { getQuoteWithLines, getQuoteRenderContext } from "@/lib/quotes";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const LOGOS_DIR = path.join(DATA_DIR, "accounting", "logos");

export async function renderQuotePdf(quoteId: string): Promise<Buffer> {
  const quote = getQuoteWithLines(quoteId);
  if (!quote) throw new Error("Offerte bestaat niet");
  const { company, client } = getQuoteRenderContext(quote);

  const logoDataUrl = company.logo_path ? loadLogo(company.logo_path) : null;

  const element = React.createElement(QuoteDocument, {
    quote,
    company,
    client,
    logoDataUrl,
  }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

function loadLogo(relPath: string): string | null {
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
