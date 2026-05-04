import fs from "fs/promises";
import path from "path";
import { extractJsonObject } from "@/lib/ai/json-extract";
import { anthropicLimiter } from "@/lib/rate-limit/limiter";
import { fetchWithLog } from "@/lib/api-logger";
import { log } from "@/lib/logger";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL =
  process.env.OCR_MODEL ||
  process.env.ANALYST_MODEL ||
  "claude-sonnet-4-5-20250929";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const PDF_DIR = path.join(DATA_DIR, "accounting", "purchase_pdfs");

export interface OcrLine {
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price_excl: number;
  vat_rate: number;
  line_total_excl: number;
}

export interface OcrResult {
  // Leverancier
  supplier_name: string | null;
  supplier_kvk: string | null;
  supplier_vat_number: string | null;
  supplier_iban: string | null;
  supplier_email: string | null;
  supplier_address: string | null;

  // Factuur
  invoice_number: string | null;
  issue_date: string | null; // ISO yyyy-mm-dd
  due_date: string | null;
  reference: string | null;
  currency: string | null;

  // Totalen (in euro's, niet cents — caller rondt af)
  subtotal: number | null;
  vat_total: number | null;
  total: number | null;
  vat_breakdown: Array<{ rate: number; base: number; vat: number }>;

  // Regels
  lines: OcrLine[];

  // Confidence + raw
  confidence: number; // 0-1, hoe zeker is Claude
  notes: string | null;
}

const SYSTEM_PROMPT = `Je bent een gespecialiseerde OCR-engine voor Nederlandse en Engelse zakelijke facturen.
Je krijgt een PDF-factuur en moet de inhoud extraheren naar gestructureerde JSON.

Belangrijke regels:
- Bedragen ALTIJD als nummer in euro's (niet cents). 12,50 → 12.50.
- Datums ALTIJD als ISO yyyy-mm-dd. "15 maart 2026" → "2026-03-15".
- BTW-tarief als geheel getal (21, 9, 0). Niet als percentage-string.
- IBAN spaties verwijderen (NL12RABO0123456789, niet "NL12 RABO 0123 4567 89").
- Als een veld onleesbaar of afwezig is: null. Niet verzinnen.
- Confidence 0.9+ als alles helder is, 0.5-0.8 bij twijfel, <0.5 bij chaos.
- Output STRICT JSON, geen markdown fences, geen toelichting.`;

const SCHEMA_PROMPT = `Output dit exact JSON-schema:
{
  "supplier_name": string | null,
  "supplier_kvk": string | null,
  "supplier_vat_number": string | null,
  "supplier_iban": string | null,
  "supplier_email": string | null,
  "supplier_address": string | null,
  "invoice_number": string | null,
  "issue_date": string | null,
  "due_date": string | null,
  "reference": string | null,
  "currency": string | null,
  "subtotal": number | null,
  "vat_total": number | null,
  "total": number | null,
  "vat_breakdown": [{ "rate": number, "base": number, "vat": number }],
  "lines": [
    {
      "description": string,
      "quantity": number,
      "unit": string | null,
      "unit_price_excl": number,
      "vat_rate": number,
      "line_total_excl": number
    }
  ],
  "confidence": number,
  "notes": string | null
}`;

/**
 * Detecteer Claude Vision content-block + media_type uit bestandsnaam.
 * PDF -> document block. JPG/PNG/WEBP/GIF -> image block. HEIC niet
 * ondersteund (zie upload-route voor user-friendly error).
 */
function detectMediaType(filePath: string): {
  contentBlock: "document" | "image";
  mediaType:
    | "application/pdf"
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";
} {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return { contentBlock: "document", mediaType: "application/pdf" };
    case ".jpg":
    case ".jpeg":
      return { contentBlock: "image", mediaType: "image/jpeg" };
    case ".png":
      return { contentBlock: "image", mediaType: "image/png" };
    case ".webp":
      return { contentBlock: "image", mediaType: "image/webp" };
    case ".gif":
      return { contentBlock: "image", mediaType: "image/gif" };
    default:
      throw new Error(
        `Niet-ondersteund bestandstype: ${ext}. Gebruik PDF, JPG, PNG, WEBP of GIF.`,
      );
  }
}

/**
 * Verstuur factuur (PDF of foto) naar Claude Vision en krijg
 * gestructureerde extractie terug. Sync — 5-15s voor PDF, 3-8s voor foto.
 */
export async function extractInvoiceFromFile(
  filePath: string,
): Promise<{ ocr: OcrResult; tokens: { input: number; output: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY ontbreekt — zet hem in de env");
  }

  const { contentBlock, mediaType: detectedMime } = detectMediaType(filePath);
  const fullPath = path.join(PDF_DIR, path.basename(filePath));
  let buffer = await fs.readFile(fullPath);
  let mediaType = detectedMime;

  // Claude Vision images limit: 5 MB base64 = ~3.7 MB raw bytes.
  // iPhone foto's zijn 4-12 MB raw — moeten we comprimeren. PDF heeft
  // 32 MB limit dus die laten we ongewijzigd.
  if (contentBlock === "image" && buffer.length > 3.5 * 1024 * 1024) {
    try {
      // Dynamic import zodat sharp alleen geladen wordt als 't moet (saves
      // boot time bij PDF-only flows).
      const sharp = (await import("sharp")).default;
      const compressed = await sharp(buffer)
        .rotate() // EXIF orientation toepassen — iPhone-foto's komen vaak gedraaid binnen
        .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      log.info(
        {
          scope: "accounting/ocr",
          original_bytes: buffer.length,
          compressed_bytes: compressed.length,
          ratio: (compressed.length / buffer.length).toFixed(2),
        },
        "image compressed for Claude Vision",
      );
      buffer = Buffer.from(compressed);
      mediaType = "image/jpeg"; // sharp output is altijd jpeg in deze flow
    } catch (err) {
      log.warn(
        {
          scope: "accounting/ocr",
          err: err instanceof Error ? err.message : String(err),
        },
        "sharp compression failed — sending original (Claude may reject if >5MB)",
      );
    }
  }

  const base64 = buffer.toString("base64");

  await anthropicLimiter.acquire();

  const sourceBlock =
    contentBlock === "document"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType,
            data: base64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType,
            data: base64,
          },
        };

  const body = {
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [sourceBlock, { type: "text", text: SCHEMA_PROMPT }],
      },
    ],
  };

  // 2026-05-04 — wired through fetchWithLog (api-logger) so OCR
  // spend lands in /app/.data/ai-cost-ledger.json and shows up at
  // /api/usage. Pre-fix, raw fetch() bypassed the ledger entirely;
  // a Sonnet 4.5 PDF call could be $0.05–0.50+ but invisible. The
  // 60s timeout matches Sonnet vision latency (typical 15-45s).
  const { response: res } = await fetchWithLog("ocr-extract", ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    timeoutMs: 60_000,
  });

  if (!res || !res.ok) {
    const errText = res ? await res.text().catch(() => "") : "no response";
    if (res?.status === 429) {
      anthropicLimiter.handle429(60);
    }
    throw new Error(`Claude API ${res?.status ?? 0}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const text = json.content?.[0]?.text || "";
  const parsed = extractJsonObject(text) as Partial<OcrResult> | null;
  if (!parsed) {
    log.error(
      { scope: "accounting/ocr", text: text.slice(0, 500) },
      "OCR response could not be parsed",
    );
    throw new Error("OCR-respons kon niet worden gelezen");
  }

  // Defensieve defaults
  const ocr: OcrResult = {
    supplier_name: parsed.supplier_name ?? null,
    supplier_kvk: parsed.supplier_kvk ?? null,
    supplier_vat_number: parsed.supplier_vat_number ?? null,
    supplier_iban: parsed.supplier_iban ?? null,
    supplier_email: parsed.supplier_email ?? null,
    supplier_address: parsed.supplier_address ?? null,
    invoice_number: parsed.invoice_number ?? null,
    issue_date: parsed.issue_date ?? null,
    due_date: parsed.due_date ?? null,
    reference: parsed.reference ?? null,
    currency: parsed.currency ?? "EUR",
    subtotal: parsed.subtotal ?? null,
    vat_total: parsed.vat_total ?? null,
    total: parsed.total ?? null,
    vat_breakdown: Array.isArray(parsed.vat_breakdown)
      ? parsed.vat_breakdown
      : [],
    lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    notes: parsed.notes ?? null,
  };

  return {
    ocr,
    tokens: {
      input: json.usage?.input_tokens || 0,
      output: json.usage?.output_tokens || 0,
    },
  };
}

/** Backward compat alias. */
export const extractInvoiceFromPdf = extractInvoiceFromFile;

/** Hulpmiddel: euro-bedrag → cents (waterdicht voor 0.01 floats). */
export function eurosToCents(n: number): number {
  return Math.round(n * 100);
}
