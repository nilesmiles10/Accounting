/**
 * Sliding-window attempt tracker for authentication throttling (M2).
 *
 * Tracks failed attempts per key (typically `${ip}:${username}` or just `${ip}`)
 * and blocks once a threshold is hit. Expired entries are pruned lazily.
 *
 * Process-local; fine for single-container deploys. If you move to multi-
 * instance, back this with Redis or a shared file.
 */

interface AttemptRecord {
  count: number;
  firstAt: number;
  /** When to allow attempts again; null = not currently blocked. */
  blockedUntil: number | null;
}

export interface AttemptTrackerOptions {
  /** Max failed attempts allowed within the window before blocking. */
  maxAttempts: number;
  /** Window in ms for counting attempts. */
  windowMs: number;
  /** How long to block after hitting the threshold. */
  blockMs: number;
}

export class AttemptTracker {
  private readonly opts: AttemptTrackerOptions;
  private readonly records = new Map<string, AttemptRecord>();

  constructor(opts: AttemptTrackerOptions) {
    this.opts = opts;
  }

  /** @returns ms until unblocked, or 0 if the key is free to proceed. */
  check(key: string): number {
    const rec = this.records.get(key);
    if (!rec) return 0;
    const now = Date.now();
    if (rec.blockedUntil && now < rec.blockedUntil) return rec.blockedUntil - now;
    if (rec.blockedUntil && now >= rec.blockedUntil) {
      this.records.delete(key);
      return 0;
    }
    // Expire stale window
    if (now - rec.firstAt > this.opts.windowMs) {
      this.records.delete(key);
      return 0;
    }
    return 0;
  }

  /** Record a failed attempt. Returns ms until unblock if now blocked, else 0. */
  recordFailure(key: string): number {
    const now = Date.now();
    const rec = this.records.get(key);
    if (!rec || now - rec.firstAt > this.opts.windowMs) {
      this.records.set(key, { count: 1, firstAt: now, blockedUntil: null });
      return 0;
    }
    rec.count++;
    if (rec.count >= this.opts.maxAttempts) {
      rec.blockedUntil = now + this.opts.blockMs;
      return this.opts.blockMs;
    }
    return 0;
  }

  /** Called on a successful auth — clear the key's counter. */
  clear(key: string): void {
    this.records.delete(key);
  }

  /** Occasional GC call if the tracker is long-lived. */
  prune(): void {
    const now = Date.now();
    this.records.forEach((v, k) => {
      if (v.blockedUntil && now >= v.blockedUntil) this.records.delete(k);
      else if (!v.blockedUntil && now - v.firstAt > this.opts.windowMs) this.records.delete(k);
    });
  }
}

// ─── Shared instance for login throttling ────────────────────

export const loginAttempts = new AttemptTracker({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 min
  blockMs: 15 * 60 * 1000,  // block 15 min after hitting 5 failures
});
