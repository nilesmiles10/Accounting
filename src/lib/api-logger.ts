import path from "path";
import type { ApiCallLogEntry } from "./api-logger-types";
import { withLock, atomicWriteJson, safeReadJson } from "@/lib/storage/atomic-store";

const LOG_PATH = path.join(process.cwd(), ".data", "earnings-api-log.json");
const COST_LEDGER_PATH = path.join(process.cwd(), ".data", "ai-cost-ledger.json");
const MAX_ENTRIES = 2000;

// v2026-04-29 — Anthropic price table (USD per 1M tokens).
// Used to convert response.usage tokens into actual cost so the
// rotating earnings-api-log doesn't lose the spend record when
// it prunes. Keep in sync with /api/usage/route.ts pricing table.
const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-6":          { input: 3.0, output: 15.0 },
  "claude-opus-4-5-20250929":   { input: 15.0, output: 75.0 },
  "claude-opus-4-6":            { input: 15.0, output: 75.0 },
  "claude-haiku-4-5-20251001":  { input: 0.25, output: 1.25 },
  "claude-haiku-4-5":           { input: 0.25, output: 1.25 },
};

const SONNET_PRICE = { input: 3.0, output: 15.0 };
const HAIKU_PRICE = { input: 0.25, output: 1.25 };
const OPUS_PRICE = { input: 15.0, output: 75.0 };

function priceFor(model: string): { input: number; output: number } {
  // Exact match first; then prefix match (e.g. anything starting "claude-sonnet")
  const exact = ANTHROPIC_PRICES[model];
  if (exact) return exact;
  if (model.startsWith("claude-haiku")) return HAIKU_PRICE;
  if (model.startsWith("claude-sonnet")) return SONNET_PRICE;
  if (model.startsWith("claude-opus")) return OPUS_PRICE;
  // Unknown model — return Sonnet pricing as conservative default
  return SONNET_PRICE;
}

interface CostLedgerDay {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Per-source running totals */
  bySource: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    perModel: Record<string, { calls: number; costUsd: number }>;
  }>;
  /** Per-day aggregate */
  totalCalls: number;
  totalCostUsd: number;
  /** Last update — for the dashboard freshness indicator */
  updatedAt: string;
}

interface CostLedger {
  /** Per-day records, oldest first. Never pruned. */
  days: CostLedgerDay[];
}

async function appendCostLedger(entry: {
  source: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: string;
}): Promise<void> {
  await withLock(COST_LEDGER_PATH, async () => {
    const ledger = await safeReadJson<CostLedger>(COST_LEDGER_PATH, { days: [] });
    const dateKey = entry.timestamp.slice(0, 10);
    let day = ledger.days.find((d) => d.date === dateKey);
    if (!day) {
      day = {
        date: dateKey,
        bySource: {},
        totalCalls: 0,
        totalCostUsd: 0,
        updatedAt: entry.timestamp,
      };
      ledger.days.push(day);
    }
    let src = day.bySource[entry.source];
    if (!src) {
      src = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, perModel: {} };
      day.bySource[entry.source] = src;
    }
    src.calls += 1;
    src.inputTokens += entry.inputTokens;
    src.outputTokens += entry.outputTokens;
    src.costUsd += entry.costUsd;
    let m = src.perModel[entry.model];
    if (!m) {
      m = { calls: 0, costUsd: 0 };
      src.perModel[entry.model] = m;
    }
    m.calls += 1;
    m.costUsd += entry.costUsd;

    day.totalCalls += 1;
    day.totalCostUsd += entry.costUsd;
    day.updatedAt = entry.timestamp;

    // Keep ledger lean — sort by date, drop entries older than ~400d.
    // 400d gives plenty of audit trail without unbounded growth.
    ledger.days.sort((a, b) => a.date.localeCompare(b.date));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 400);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    ledger.days = ledger.days.filter((d) => d.date >= cutoffKey);

    await atomicWriteJson(COST_LEDGER_PATH, ledger);
  });
}

/** Public read accessor — used by /api/usage to surface real spend. */
export async function loadCostLedger(): Promise<CostLedger> {
  return safeReadJson<CostLedger>(COST_LEDGER_PATH, { days: [] });
}

// 2026-05-04 — budget enforcement. Pre-fix the budgets file
// (cost-budgets.json) was a soft threshold the dashboard could
// display but nothing checked it before firing a Claude API
// call. After observing $25 of console balance silently drain
// across untracked OCR + local Claude Code spend, fetchWithLog
// now consults the budgets and refuses Anthropic calls when the
// rolling spend window has crossed the cap.
const BUDGETS_PATH = path.join(process.cwd(), ".data", "cost-budgets.json");

interface Budgets {
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
}

async function loadBudgets(): Promise<Budgets> {
  return safeReadJson<Budgets>(BUDGETS_PATH, {
    daily: null, weekly: null, monthly: null,
  });
}

/** Aggregate ledger spend over the last N days (today included). */
function spendInLastDays(ledger: CostLedger, days: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  return ledger.days
    .filter((d) => d.date >= cutoffKey)
    .reduce((sum, d) => sum + d.totalCostUsd, 0);
}

/** Returns { ok, reason } — when ok=false the caller should refuse the API call. */
export async function checkBudget(): Promise<
  { ok: true } | { ok: false; reason: string; window: string; spent: number; cap: number }
> {
  const [budgets, ledger] = await Promise.all([loadBudgets(), loadCostLedger()]);
  if (budgets.daily != null) {
    const spent = spendInLastDays(ledger, 1);
    if (spent >= budgets.daily) {
      return { ok: false, reason: "daily budget exceeded", window: "today",
        spent, cap: budgets.daily };
    }
  }
  if (budgets.weekly != null) {
    const spent = spendInLastDays(ledger, 7);
    if (spent >= budgets.weekly) {
      return { ok: false, reason: "weekly budget exceeded", window: "7d",
        spent, cap: budgets.weekly };
    }
  }
  if (budgets.monthly != null) {
    const spent = spendInLastDays(ledger, 30);
    if (spent >= budgets.monthly) {
      return { ok: false, reason: "monthly budget exceeded", window: "30d",
        spent, cap: budgets.monthly };
    }
  }
  return { ok: true };
}

// L9: broader pattern list — previously only token|apikey|key were scrubbed.
const REDACT_PATTERN = /([?&])(token|apikey|api_key|access_token|auth_token|key|secret|password|pwd|sig)=[^&]+/gi;
function redactKey(url: string): string {
  return url.replace(REDACT_PATTERN, "$1$2=***");
}

function genId(): string {
  return `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function loadApiLog(): Promise<ApiCallLogEntry[]> {
  return safeReadJson<ApiCallLogEntry[]>(LOG_PATH, []);
}

async function appendLog(entry: ApiCallLogEntry): Promise<void> {
  await withLock(LOG_PATH, async () => {
    const log = await safeReadJson<ApiCallLogEntry[]>(LOG_PATH, []);
    log.push(entry);
    // Prune to MAX_ENTRIES
    const trimmed = log.length > MAX_ENTRIES ? log.slice(-MAX_ENTRIES) : log;
    await atomicWriteJson(LOG_PATH, trimmed);
  });
}

/**
 * Wraps a fetch call and logs it automatically.
 * Returns { response, entry } — the caller gets both the raw Response and the log entry.
 */
export async function fetchWithLog(
  sourceId: string,
  url: string,
  options?: RequestInit & { symbol?: string; timeoutMs?: number }
): Promise<{ response: Response | null; entry: ApiCallLogEntry }> {
  const start = Date.now();
  const entry: ApiCallLogEntry = {
    id: genId(),
    timestamp: new Date().toISOString(),
    source: sourceId,
    url: redactKey(url),
    method: options?.method || "GET",
    statusCode: 0,
    responseTimeMs: 0,
    dataPointsExtracted: 0,
    symbol: options?.symbol,
  };

  // 2026-05-04 — budget gate for Anthropic calls only. Other API
  // sources (Finnhub, TwelveData) are rate-limited but not budgeted
  // here, so they pass through unchanged.
  if (url.includes("api.anthropic.com")) {
    try {
      const budget = await checkBudget();
      if (!budget.ok) {
        entry.statusCode = 429;
        entry.error = `Budget exceeded: ${budget.reason} ($${budget.spent.toFixed(2)} / $${budget.cap.toFixed(2)} ${budget.window})`;
        await appendLog(entry);
        return { response: null, entry };
      }
    } catch {
      // budget check failure must not block calls — fall through
    }
  }

  try {
    // 2026-05-04 — caller can pass timeoutMs (default 10s). Sonnet
    // PDF OCR realistically takes 15-45s; the default 10s would
    // abort and produce silent retry-from-caller cost duplication.
    const timeoutMs = options?.timeoutMs ?? 10000;
    const res = await fetch(url, {
      ...options,
      signal: options?.signal || AbortSignal.timeout(timeoutMs),
    });
    entry.statusCode = res.status;
    entry.responseTimeMs = Date.now() - start;
    if (!res.ok) {
      entry.error = `HTTP ${res.status}`;
    }

    // v2026-04-29 — Anthropic spend capture. Clone the response,
    // peek at usage, write to the cost ledger. Best-effort: any
    // parse failure leaves the entry with no token data and the
    // caller's response unaffected. Only fires for api.anthropic.com
    // 2xx responses to avoid double-reading bodies for non-AI calls.
    if (res.ok && url.includes("api.anthropic.com")) {
      try {
        const cloned = res.clone();
        const body = await cloned.json() as {
          usage?: { input_tokens?: number; output_tokens?: number };
          model?: string;
        };
        const inT = body.usage?.input_tokens ?? 0;
        const outT = body.usage?.output_tokens ?? 0;
        const model = body.model ?? "unknown";
        if (inT > 0 || outT > 0) {
          const p = priceFor(model);
          const costUsd = (inT * p.input + outT * p.output) / 1_000_000;
          entry.inputTokens = inT;
          entry.outputTokens = outT;
          entry.costUsd = Math.round(costUsd * 1e6) / 1e6;  // round to 6 decimals
          entry.model = model;
          // Write to non-rotating ledger as well (truth source for
          // /api/usage even after the api-log rotates this entry out)
          appendCostLedger({
            source: sourceId, model, inputTokens: inT, outputTokens: outT,
            costUsd, timestamp: entry.timestamp,
          }).catch(() => { /* best-effort */ });
        }
      } catch {
        // Body wasn't JSON or didn't have usage — fine, just don't capture
      }
    }

    await appendLog(entry);
    return { response: res, entry };
  } catch (err) {
    entry.statusCode = 0;
    entry.responseTimeMs = Date.now() - start;
    entry.error = String(err).slice(0, 200);
    await appendLog(entry);
    return { response: null, entry };
  }
}

/** Update an existing log entry's dataPointsExtracted count. */
export async function updateLogEntry(id: string, dataPoints: number): Promise<void> {
  await withLock(LOG_PATH, async () => {
    const log = await safeReadJson<ApiCallLogEntry[]>(LOG_PATH, []);
    const idx = log.findIndex((e) => e.id === id);
    const entry = idx >= 0 ? log[idx] : undefined;
    if (entry) {
      entry.dataPointsExtracted = dataPoints;
      await atomicWriteJson(LOG_PATH, log);
    }
  });
}

/** Get filtered API log entries. */
export async function getApiLog(filters?: {
  source?: string;
  symbol?: string;
  date?: string;
  limit?: number;
}): Promise<ApiCallLogEntry[]> {
  let log = await loadApiLog();
  if (filters?.source) log = log.filter((e) => e.source === filters.source);
  if (filters?.symbol) log = log.filter((e) => e.symbol === filters.symbol);
  if (filters?.date) log = log.filter((e) => e.timestamp.startsWith(filters.date!));
  log.reverse(); // newest first
  if (filters?.limit) log = log.slice(0, filters.limit);
  return log;
}

/** Count API calls from today. */
export async function countTodayCalls(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const log = await loadApiLog();
  return log.filter((e) => e.timestamp.startsWith(today)).length;
}
