import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, resetLedger } from "@/test/db";
import { post } from "@/lib/ledger/journal";
import { generateTrialBalance } from "./trial-balance";

beforeAll(() => {
  initTestDb();
});
beforeEach(() => {
  resetLedger();
});

function expense(date: string, cents: number) {
  post({
    date,
    description: "Kosten",
    source_type: "manual",
    lines: [
      { account_code: "4000", debit_cents: cents },
      { account_code: "1100", credit_cents: cents },
    ],
  });
}

describe("generateTrialBalance", () => {
  it("is in balans en toont saldo per rekening", () => {
    expense("2026-02-01", 10_000);
    expense("2026-02-15", 2_500);
    const tb = generateTrialBalance("2026-01-01", "2026-12-31");
    expect(tb.in_balance).toBe(true);
    expect(tb.debit_grand_total).toBe(12_500);
    const byCode = Object.fromEntries(tb.lines.map((l) => [l.code, l.balance_cents]));
    expect(byCode).toEqual({ "1100": -12_500, "4000": 12_500 });
  });

  it("telt alleen boekingen binnen [from, to] mee", () => {
    expense("2025-12-31", 99_900); // vorig jaar
    expense("2026-06-01", 10_000);
    expense("2027-01-01", 88_800); // volgend jaar
    const tb = generateTrialBalance("2026-01-01", "2026-12-31");
    expect(tb.debit_grand_total).toBe(10_000);
    expect(tb.credit_grand_total).toBe(10_000);
  });

  it("lege periode geeft geen regels", () => {
    expense("2025-06-01", 10_000);
    const tb = generateTrialBalance("2026-01-01", "2026-12-31");
    expect(tb.lines).toEqual([]);
  });
});
