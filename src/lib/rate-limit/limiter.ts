/**
 * Sliding-window rate limiter (H5 in CODEBASE_REVIEW_FIXES.md).
 *
 * Previously Finnhub had its own ad-hoc limiter; Twelve Data had none at all —
 * meaning the free-tier 8/min cap silently broke shadow-tracker on bursty runs.
 * This is a single process-wide implementation both callers share.
 *
 * Semantics:
 * - Tracks the timestamps of the last N calls within a rolling window.
 * - `acquire()` resolves once a slot is available (awaits if necessary).
 * - Multiple concurrent `acquire()` callers are serialized so the Nth waiter
 *   wakes up on the (N-1)th slot freeing up.
 * - `handle429(retryAfterSec?)` lets callers park the limiter for the
 *   Retry-After period after the remote tells us to back off.
 *
 * Not persistent across processes; intended for a single Next.js server.
 */

import { log } from "@/lib/logger";

export interface RateLimiterOptions {
  /** Max calls allowed per window. */
  maxPerWindow: number;
  /** Window length in ms. Default 60_000 (one minute). */
  windowMs?: number;
  /** Optional label used in log messages. */
  name?: string;
}

export class RateLimiter {
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly name: string;
  private timestamps: number[] = [];
  /** Wall-clock ms until which all new acquires must wait (429 backoff). */
  private backoffUntil = 0;
  /** Serialize acquires so parallel callers queue cleanly. */
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: RateLimiterOptions) {
    this.maxPerWindow = opts.maxPerWindow;
    this.windowMs = opts.windowMs ?? 60_000;
    this.name = opts.name ?? "rate-limit";
  }

  async acquire(): Promise<void> {
    const next = this.chain.then(() => this.acquireOne());
    // Keep the chain silent so a single error doesn't break all followers.
    this.chain = next.catch(() => {});
    return next;
  }

  private async acquireOne(): Promise<void> {
    // Respect explicit 429 backoff first.
    const now1 = Date.now();
    if (this.backoffUntil > now1) {
      const waitMs = this.backoffUntil - now1;
      log.warn({ scope: "rate-limit", limiter: this.name, waitMs }, "backing off from 429");
      await sleep(waitMs);
    }

    // Sliding window check.
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxPerWindow) {
      const waitMs = (this.timestamps[0] ?? now) + this.windowMs - now + 50;
      await sleep(waitMs);
      // Drop the one that just expired.
      this.timestamps = this.timestamps.filter((t) => Date.now() - t < this.windowMs);
    }
    this.timestamps.push(Date.now());
  }

  /** Called after a 429 — park all new acquires for at least `retryAfterSec`. */
  handle429(retryAfterSec?: number): void {
    const ms = Math.max(1, retryAfterSec ?? 30) * 1000;
    const until = Date.now() + ms;
    if (until > this.backoffUntil) this.backoffUntil = until;
    log.warn({ scope: "rate-limit", limiter: this.name, pauseMs: ms }, "429 received, pausing");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse a Retry-After header value (seconds or HTTP-date) to seconds. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const asInt = parseInt(header, 10);
  if (!Number.isNaN(asInt) && asInt >= 0) return asInt;
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return undefined;
}

// ─── Pre-configured shared instances ─────────────────────────
// Import these directly rather than constructing per-call-site.

export const finnhubLimiter = new RateLimiter({
  name: "finnhub",
  maxPerWindow: 60,
  windowMs: 60_000,
});

export const twelveDataLimiter = new RateLimiter({
  name: "twelvedata",
  maxPerWindow: 8, // free tier
  windowMs: 60_000,
});

export const anthropicLimiter = new RateLimiter({
  name: "anthropic",
  maxPerWindow: 50,
  windowMs: 60_000,
});
