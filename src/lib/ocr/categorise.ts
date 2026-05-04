import { extractJsonObject } from "@/lib/ai/json-extract";
import { anthropicLimiter } from "@/lib/rate-limit/limiter";
import { fetchWithLog } from "@/lib/api-logger";
import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";
import { listAccounts } from "@/lib/ledger/accounts";
import { log } from "@/lib/logger";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL =
  process.env.OCR_CATEGORISE_MODEL || "claude-haiku-4-5-20251001";

export interface CategorisationSuggestion {
  line_index: number;
  description: string;
  suggested_account_code: string;
  confidence: number; // 0-1
  reason: string;
}

export interface HistoricalMatch {
  account_code: string;
  count: number;
  last_used_at: number;
}

/**
 * Zoek de meest-gebruikte grootboekrekening voor een leverancier op basis
 * van eerder goedgekeurde of betaalde inkoopfacturen. Returns null als er
 * geen historie is.
 */
export function findHistoricalAccount(
  supplierId: string,
): HistoricalMatch | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT pl.account_code, COUNT(*) AS n,
              MAX(p.approved_at) AS last_used
       FROM purchase_invoice_lines pl
       JOIN purchase_invoices p ON p.id = pl.purchase_invoice_id
       WHERE p.tenant_id = ?
         AND p.supplier_id = ?
         AND p.status IN ('approved', 'paid')
         AND pl.account_code IS NOT NULL
       GROUP BY pl.account_code
       ORDER BY n DESC, last_used DESC
       LIMIT 1`,
    )
    .get(getCurrentTenantId(), supplierId) as
    | { account_code: string; n: number; last_used: number }
    | undefined;

  if (!row || !row.account_code) return null;
  return {
    account_code: row.account_code,
    count: row.n,
    last_used_at: row.last_used,
  };
}

/**
 * Vraag Claude Haiku om een grootboekrekening per regel te suggereren
 * voor een nieuwe of onbekende leverancier. Goedkoop (~$0.0005/call).
 */
export async function categoriseLines(input: {
  supplier_name: string | null;
  supplier_history?: string | null; // bv. "Adobe → 4600 (3x), Google → 4600 (2x)"
  lines: Array<{ description: string; total_excl: number }>;
}): Promise<CategorisationSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  // Pak alleen expense-rekeningen — kosten van de organisatie
  const accounts = listAccounts({ type: "expense", activeOnly: true });
  if (accounts.length === 0) return [];

  await anthropicLimiter.acquire();

  const accountList = accounts
    .map((a) => `${a.code}  ${a.name}${a.description ? ` — ${a.description}` : ""}`)
    .join("\n");

  const linesPrompt = input.lines
    .map(
      (l, i) =>
        `${i}: "${l.description}" (€${l.total_excl.toFixed(2)} excl. BTW)`,
    )
    .join("\n");

  const systemPrompt = `Je bent een Nederlandse boekhoudkundig assistent.
Je krijgt een leverancier en factuurregels, en moet voor elke regel de meest passende grootboekrekening kiezen uit de beschikbare lijst (alleen kosten-rekeningen).

BELANGRIJK:
- Kies NOOIT 4000 "Algemene kosten" als er een specifieker alternatief past.
  4000 is alleen toegestaan als er ECHT geen passender rekening is.
- Veelvoorkomende patronen:
  * SaaS / software / online tools / apps  → 4600 ICT-software & SaaS
  * Hosting / domeinen / cloud-providers   → 4600
  * Reizen / OV / parkeren / hotels         → 4500 Reiskosten
  * Brandstof / leasekosten auto            → 4550 Auto / brandstof
  * Telefoon / mobiel / internet-abo        → 4400 Telefoon & internet
  * Marketing / ads / Meta/Google ads       → 4700 Marketing & reclame
  * Boekhouder / juridisch advies           → 4900 Accountantskosten
  * Verzekeringen                           → 4200
  * Bankkosten                              → 4800
  * Energie / gas / stroom / water          → 4300
  * Inkoop voor doorverkoop                 → 7000 Inkoopwaarde
  * Kantoor / klein materiaal / kleding     → 4950 Diverse kleine kosten
  * Huur kantoor / werkruimte               → 4100 Huur

Output regels:
- Kies altijd een 4-cijferige code die in de gegeven lijst staat.
- Confidence 0.9+ alleen als je echt zeker bent.
- Confidence 0.5-0.8 bij waarschijnlijk-juiste match.
- Confidence <0.5 alleen als je twijfelt en dan bij voorkeur 4950.
- Reden in 1-2 zinnen, in het Nederlands.
- Output STRICT JSON, geen markdown fences.`;

  const userPrompt = `BESCHIKBARE GROOTBOEKREKENINGEN:
${accountList}

LEVERANCIER: ${input.supplier_name || "(onbekend)"}
${input.supplier_history ? `\nHISTORIE LEVERANCIER:\n${input.supplier_history}` : ""}

REGELS:
${linesPrompt}

Output JSON:
{
  "suggestions": [
    { "line_index": 0, "description": "...", "suggested_account_code": "4600", "confidence": 0.9, "reason": "..." }
  ]
}`;

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  try {
    // 2026-05-04 — wired through fetchWithLog so OCR-categorise spend
    // shows up in the cost ledger and /api/usage. Pre-fix this raw
    // fetch bypassed the api-logger.
    const { response: res } = await fetchWithLog(
      "ocr-categorise",
      ANTHROPIC_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res || !res.ok) {
      if (res?.status === 429) anthropicLimiter.handle429(60);
      const errText = res ? await res.text().catch(() => "") : "no response";
      throw new Error(`Haiku ${res?.status ?? 0}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = json.content?.[0]?.text || "";
    const parsed = extractJsonObject(text) as {
      suggestions?: CategorisationSuggestion[];
    } | null;
    return parsed?.suggestions || [];
  } catch (err) {
    log.warn(
      {
        scope: "accounting/categorise",
        err: err instanceof Error ? err.message : String(err),
      },
      "categorisatie via Haiku faalde — geen suggesties",
    );
    return [];
  }
}

/**
 * Bouw een korte historie-string voor de Haiku-prompt: top-5 meest-
 * gebruikte combinaties leverancier+account uit recente invoices.
 */
export function buildSupplierHistorySnippet(supplierId: string): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pl.description, pl.account_code, COUNT(*) AS n
       FROM purchase_invoice_lines pl
       JOIN purchase_invoices p ON p.id = pl.purchase_invoice_id
       WHERE p.tenant_id = ?
         AND p.supplier_id = ?
         AND p.status IN ('approved', 'paid')
         AND pl.account_code IS NOT NULL
       GROUP BY pl.description, pl.account_code
       ORDER BY n DESC
       LIMIT 5`,
    )
    .all(getCurrentTenantId(), supplierId) as Array<{
    description: string;
    account_code: string;
    n: number;
  }>;
  if (rows.length === 0) return "";
  return rows
    .map((r) => `"${r.description}" → ${r.account_code} (${r.n}×)`)
    .join("\n");
}
