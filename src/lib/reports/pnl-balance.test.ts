import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, resetLedger } from "@/test/db";
import { post } from "@/lib/ledger/journal";
import { generatePnL } from "./pnl";
import { generateBalance } from "./balance";

beforeAll(() => {
  initTestDb();
});
beforeEach(() => {
  resetLedger();
});

function sale(date: string, base: number, company_id: string | null = null) {
  const vat = Math.round(base * 0.21);
  post({
    date,
    description: "Verkoop",
    source_type: "invoice",
    company_id,
    lines: [
      { account_code: "1300", debit_cents: base + vat },
      { account_code: "8000", credit_cents: base, vat_code: "21" },
      { account_code: "1700", credit_cents: vat, vat_code: "21" },
    ],
  });
}

function cost(date: string, amount: number, company_id: string | null = null) {
  post({
    date,
    description: "Kosten",
    source_type: "manual",
    company_id,
    lines: [
      { account_code: "4000", debit_cents: amount },
      { account_code: "1100", credit_cents: amount },
    ],
  });
}

describe("generatePnL", () => {
  it("berekent omzet, kosten en nettowinst", () => {
    sale("2026-03-01", 100_000);
    cost("2026-03-05", 30_000);
    const p = generatePnL("2026-01-01", "2026-12-31");
    expect(p.income_total).toBe(100_000);
    expect(p.expenses_total).toBe(30_000);
    expect(p.net_profit_cents).toBe(70_000);
  });

  it("telt alleen boekingen binnen de periode mee", () => {
    sale("2025-12-31", 55_500);
    sale("2026-03-01", 100_000);
    cost("2027-01-01", 44_400);
    const p = generatePnL("2026-01-01", "2026-12-31");
    expect(p.income_total).toBe(100_000);
    expect(p.expenses_total).toBe(0);
  });

  it("filtert op bedrijf", () => {
    sale("2026-03-01", 100_000, "intersumma");
    sale("2026-03-02", 40_000, "maelilly");
    cost("2026-03-03", 10_000, "maelilly");
    const p = generatePnL("2026-01-01", "2026-12-31", "maelilly");
    expect(p.income_total).toBe(40_000);
    expect(p.net_profit_cents).toBe(30_000);
    expect(generatePnL("2026-01-01", "2026-12-31").income_total).toBe(140_000);
  });
});

describe("generateBalance", () => {
  it("activa = passiva incl. resultaat", () => {
    sale("2026-03-01", 100_000);
    cost("2026-03-05", 30_000);
    const b = generateBalance("2026-12-31");
    expect(b.imbalance_cents).toBe(0);
    expect(b.retained_earnings_cents).toBe(70_000);
  });

  it("negeert boekingen na de peildatum", () => {
    sale("2026-03-01", 100_000);
    sale("2026-07-01", 50_000); // na peildatum
    const b = generateBalance("2026-06-30");
    const debiteuren = b.assets.find((l) => l.code === "1300");
    expect(debiteuren?.amount_cents).toBe(121_000);
    expect(b.retained_earnings_cents).toBe(100_000);
    expect(b.imbalance_cents).toBe(0);
  });
});
