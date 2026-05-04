/**
 * PayPal Reports API integratie. Gebruikt OAuth2 client_credentials
 * flow + de Transactions Search endpoint:
 *   https://api.paypal.com/v1/reporting/transactions
 *
 * Vereiste env-vars:
 *   PAYPAL_CLIENT_ID      - uit developer.paypal.com -> Apps -> Live
 *   PAYPAL_CLIENT_SECRET  - idem (geheim, alleen op VPS in .env)
 *
 * Dit gebruikt JOUW eigen Business-account, geen gedelegeerde toegang
 * voor andere users. Geen OAuth-redirect-flow nodig.
 *
 * PayPal-quirks waar we rekening mee houden:
 *   - Transacties zijn ~3 uur vertraagd in de Reports API
 *   - Max 31 dagen per call -> we chunken bij grotere sync windows
 *   - Pagination via page_size (max 500) + page
 *   - Datum-formaat: ISO 8601 met TZ (bv 2026-05-04T00:00:00-0000)
 */

import { log } from "@/lib/logger";

const PAYPAL_BASE = process.env.PAYPAL_BASE_URL || "https://api-m.paypal.com";

export interface PaypalTransaction {
  external_id: string;
  date: string;            // YYYY-MM-DD (initiation date)
  amount_cents: number;    // signed
  currency: string;
  counterparty_name: string | null;
  counterparty_email: string | null;
  description: string | null;
  status: string;          // S=success, P=pending, V=reversed, etc
}

interface PaypalApiTx {
  transaction_info?: {
    transaction_id?: string;
    transaction_initiation_date?: string;
    transaction_amount?: { value?: string; currency_code?: string };
    transaction_status?: string;
    transaction_subject?: string;
    transaction_note?: string;
    invoice_id?: string;
  };
  payer_info?: {
    payer_name?: { alternate_full_name?: string };
    email_address?: string;
  };
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET niet ingesteld in .env",
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`PayPal OAuth ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as TokenResponse;
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

function formatPaypalDate(date: Date): string {
  // 2026-05-04T00:00:00-0000
  const iso = date.toISOString().replace("Z", "-0000");
  return iso.split(".")[0] + "-0000";
}

async function fetchTransactionsForRange(
  fromDate: Date,
  toDate: Date,
): Promise<PaypalApiTx[]> {
  const token = await getAccessToken();
  const all: PaypalApiTx[] = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const url = new URL(`${PAYPAL_BASE}/v1/reporting/transactions`);
    url.searchParams.set("start_date", formatPaypalDate(fromDate));
    url.searchParams.set("end_date", formatPaypalDate(toDate));
    url.searchParams.set("fields", "transaction_info,payer_info");
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `PayPal Reports ${res.status}: ${errText.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      transaction_details?: PaypalApiTx[];
      total_pages?: number;
      page?: number;
    };
    const items = json.transaction_details || [];
    all.push(...items);
    if (items.length < pageSize) break;
    if (json.total_pages && page >= json.total_pages) break;
    page++;
    if (page > 50) break; // safety
  }
  return all;
}

function chunkRange(
  from: Date,
  to: Date,
): Array<{ from: Date; to: Date }> {
  // PayPal Reports API: max 31 dagen per call.
  const chunks: Array<{ from: Date; to: Date }> = [];
  const MAX_MS = 30 * 24 * 60 * 60 * 1000; // 30d voor veiligheid
  let cursor = new Date(from);
  while (cursor < to) {
    const chunkEnd = new Date(
      Math.min(cursor.getTime() + MAX_MS, to.getTime()),
    );
    chunks.push({ from: new Date(cursor), to: chunkEnd });
    cursor = chunkEnd;
  }
  return chunks;
}

function mapTransaction(api: PaypalApiTx): PaypalTransaction | null {
  const info = api.transaction_info;
  if (!info?.transaction_id) return null;
  const dateStr = info.transaction_initiation_date;
  if (!dateStr) return null;
  const valueRaw = info.transaction_amount?.value || "0";
  const valueNum = parseFloat(valueRaw);
  if (!Number.isFinite(valueNum)) return null;
  const cents = Math.round(valueNum * 100); // PayPal levert al signed (negatief = uitgaand)

  const payerName =
    api.payer_info?.payer_name?.alternate_full_name?.trim() || null;
  const payerEmail = api.payer_info?.email_address?.trim() || null;
  const description =
    info.transaction_subject?.trim() ||
    info.transaction_note?.trim() ||
    info.invoice_id?.trim() ||
    null;

  return {
    external_id: info.transaction_id,
    date: dateStr.slice(0, 10),
    amount_cents: cents,
    currency: info.transaction_amount?.currency_code || "EUR",
    counterparty_name: payerName,
    counterparty_email: payerEmail,
    description,
    status: info.transaction_status || "",
  };
}

export async function fetchPaypalTransactions(input: {
  from: Date;
  to: Date;
}): Promise<PaypalTransaction[]> {
  const chunks = chunkRange(input.from, input.to);
  const all: PaypalTransaction[] = [];
  for (const c of chunks) {
    try {
      const apiTxs = await fetchTransactionsForRange(c.from, c.to);
      for (const a of apiTxs) {
        const tx = mapTransaction(a);
        if (tx && (tx.status === "S" || tx.status === "")) {
          // Alleen succesvolle transacties; pending/reversed komen via
          // volgende sync mee als ze settled zijn
          all.push(tx);
        }
      }
    } catch (err) {
      log.warn(
        {
          scope: "bank/paypal",
          from: c.from.toISOString(),
          to: c.to.toISOString(),
          err: err instanceof Error ? err.message : String(err),
        },
        "PayPal chunk fetch faalde - overslaan, andere chunks doorgaan",
      );
    }
  }
  return all;
}

export function paypalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}
