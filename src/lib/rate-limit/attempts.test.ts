import { describe, it, expect } from "vitest";
import { AttemptTracker } from "./attempts";

describe("AttemptTracker", () => {
  it("returns 0 for recordFailure below threshold", () => {
    const t = new AttemptTracker({ maxAttempts: 3, windowMs: 60_000, blockMs: 60_000 });
    expect(t.recordFailure("k")).toBe(0);
    expect(t.recordFailure("k")).toBe(0);
  });

  it("returns positive ms once threshold is hit", () => {
    const t = new AttemptTracker({ maxAttempts: 3, windowMs: 60_000, blockMs: 5_000 });
    t.recordFailure("k");
    t.recordFailure("k");
    const blocked = t.recordFailure("k");
    expect(blocked).toBe(5_000);
    expect(t.check("k")).toBeGreaterThan(0);
    expect(t.check("k")).toBeLessThanOrEqual(5_000);
  });

  it("clear resets the counter", () => {
    const t = new AttemptTracker({ maxAttempts: 2, windowMs: 60_000, blockMs: 5_000 });
    t.recordFailure("k");
    t.clear("k");
    // Next failure shouldn't block because counter is fresh
    expect(t.recordFailure("k")).toBe(0);
    expect(t.check("k")).toBe(0);
  });

  it("block expires after blockMs", async () => {
    const t = new AttemptTracker({ maxAttempts: 2, windowMs: 1000, blockMs: 50 });
    t.recordFailure("k");
    const blocked = t.recordFailure("k");
    expect(blocked).toBe(50);
    expect(t.check("k")).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(t.check("k")).toBe(0);
  });

  it("tracks different keys independently", () => {
    const t = new AttemptTracker({ maxAttempts: 2, windowMs: 60_000, blockMs: 5_000 });
    t.recordFailure("a");
    t.recordFailure("a");
    expect(t.check("a")).toBeGreaterThan(0);
    expect(t.check("b")).toBe(0);
  });
});
