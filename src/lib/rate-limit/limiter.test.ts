import { describe, it, expect } from "vitest";
import { RateLimiter, parseRetryAfter } from "./limiter";

describe("RateLimiter sliding window", () => {
  it("allows up to maxPerWindow immediately then throttles", async () => {
    const rl = new RateLimiter({ maxPerWindow: 3, windowMs: 200, name: "t1" });
    const start = Date.now();
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    const afterThree = Date.now() - start;
    // First three should be ~immediate
    expect(afterThree).toBeLessThan(100);
    await rl.acquire(); // should wait until first expires (~200ms)
    const afterFour = Date.now() - start;
    expect(afterFour).toBeGreaterThanOrEqual(200);
    // shouldn't hang too long
    expect(afterFour).toBeLessThan(500);
  });

  it("serializes parallel acquires via chain", async () => {
    const rl = new RateLimiter({ maxPerWindow: 2, windowMs: 150, name: "t2" });
    const start = Date.now();
    await Promise.all([rl.acquire(), rl.acquire(), rl.acquire(), rl.acquire()]);
    const elapsed = Date.now() - start;
    // 4 acquires, 2 per 150ms → 2nd pair waits ~150ms. 3rd pair would wait again → ~300ms.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });
});

describe("RateLimiter.handle429", () => {
  it("parks new acquires for at least retryAfter seconds", async () => {
    const rl = new RateLimiter({ maxPerWindow: 10, windowMs: 60_000, name: "t3" });
    rl.handle429(1); // 1 second backoff (min 1s)
    const start = Date.now();
    await rl.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  it("uses default 30s when retryAfter unspecified but caps at min 1s", () => {
    const rl = new RateLimiter({ maxPerWindow: 10, windowMs: 60_000, name: "t4" });
    // Just confirm no throw; behavior is observable via acquire timing but 30s
    // is too long to assert against in tests.
    expect(() => rl.handle429()).not.toThrow();
  });
});

describe("parseRetryAfter", () => {
  it("parses plain seconds", () => {
    expect(parseRetryAfter("5")).toBe(5);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("120")).toBe(120);
  });

  it("parses HTTP-date to seconds from now", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const secs = parseRetryAfter(future);
    expect(secs).toBeGreaterThanOrEqual(9);
    expect(secs).toBeLessThanOrEqual(11);
  });

  it("returns undefined for null / unparseable", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("not a thing")).toBeUndefined();
  });
});
