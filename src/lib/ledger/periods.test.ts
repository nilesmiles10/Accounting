import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, resetLedger } from "@/test/db";
import { post, listEntries } from "./journal";
import {
  closeQuarter,
  getVatSubmission,
  isQuarterClosed,
  reopenQuarter,
  submitVatQuarter,
} from "./periods";
import { generateVatReport, quarterRange } from "@/lib/reports/vat";

beforeAll(() => {
  initTestDb();
});
beforeEach(() => {
  resetLedger();
});

/** Verkoopfactuur 21%: 1300 aan 8000 + 1700. */
function sale(date: string, baseCents: number, rate: 21 | 9 = 21) {
  const vat = Math.round((baseCents * rate) / 100);
  post({
    date,
    description: `Verkoop ${rate}%`,
    source_type: "invoice",
    lines: [
      { account_code: "1300", debit_cents: baseCents + vat },
      {
        account_code: rate === 21 ? "8000" : "8001",
        credit_cents: baseCents,
        vat_code: String(rate),
      },
      { account_code: "1700", credit_cents: vat, vat_code: String(rate) },
    ],
  });
}

/** Inkoopfactuur 21%: 4000 + 1500 aan 1600. */
function purchase(date: string, baseCents: number) {
  const vat = Math.round(baseCents * 0.21);
  post({
    date,
    description: "Inkoop 21%",
    source_type: "purchase",
    lines: [
      { account_code: "4000", debit_cents: baseCents, vat_code: "21" },
      { account_code: "1500", debit_cents: vat, vat_code: "21" },
      { account_code: "1600", credit_cents: baseCents + vat },
    ],
  });
}

describe("quarterRange", () => {
  it.each([
    [1, "2026-01-01", "2026-03-31"],
    [2, "2026-04-01", "2026-06-30"],
    [3, "2026-07-01", "2026-09-30"],
    [4, "2026-10-01", "2026-12-31"],
  ] as const)("Q%i → %s t/m %s", (q, from, to) => {
    expect(quarterRange(2026, q)).toEqual({ from, to });
  });
});

describe("closeQuarter / reopenQuarter", () => {
  it("sluit alle 3 maanden en weigert daarna boekingen", () => {
    closeQuarter(2026, 1);
    expect(isQuarterClosed(2026, 1)).toBe(true);
    expect(() => sale("2026-02-15", 10_000)).toThrow(/afgesloten/);
    // Q2 blijft open
    expect(() => sale("2026-04-01", 10_000)).not.toThrow();
  });

  it("is idempotent", () => {
    closeQuarter(2026, 1);
    closeQuarter(2026, 1);
    expect(isQuarterClosed(2026, 1)).toBe(true);
  });

  it("kwartaal zonder periode-rijen telt als open", () => {
    expect(isQuarterClosed(2026, 3)).toBe(false);
  });

  it("heropenen staat boekingen weer toe", () => {
    closeQuarter(2026, 1);
    reopenQuarter(2026, 1);
    expect(isQuarterClosed(2026, 1)).toBe(false);
    expect(() => sale("2026-02-15", 10_000)).not.toThrow();
  });
});

describe("generateVatReport", () => {
  it("vult 1a/1b en 5b en berekent het saldo", () => {
    sale("2026-01-10", 100_000, 21); // 1a: 1000,00 / 210,00
    sale("2026-02-10", 50_000, 9); //   1b: 500,00 / 45,00
    purchase("2026-03-10", 20_000); //  5b: 42,00

    const r = generateVatReport("2026-01-01", "2026-03-31");
    const rub = Object.fromEntries(r.rubrics.map((x) => [x.rubric, x]));
    expect(rub["1a"]).toMatchObject({ base_cents: 100_000, vat_cents: 21_000 });
    expect(rub["1b"]).toMatchObject({ base_cents: 50_000, vat_cents: 4_500 });
    expect(rub["5b"]).toMatchObject({ base_cents: 20_000, vat_cents: 4_200 });
    expect(r.to_pay_cents).toBe(21_000 + 4_500 - 4_200);
  });

  it("negeert boekingen buiten de periode", () => {
    sale("2025-12-31", 100_000);
    sale("2026-04-01", 100_000);
    const r = generateVatReport("2026-01-01", "2026-03-31");
    expect(r.to_pay_cents).toBe(0);
  });

  it("creditnota (omgekeerde boeking) verlaagt omzet en BTW", () => {
    sale("2026-01-10", 100_000);
    post({
      date: "2026-01-20",
      description: "Creditnota",
      source_type: "invoice",
      lines: [
        { account_code: "8000", debit_cents: 20_000, vat_code: "21" },
        { account_code: "1700", debit_cents: 4_200, vat_code: "21" },
        { account_code: "1300", credit_cents: 24_200 },
      ],
    });
    const r = generateVatReport("2026-01-01", "2026-03-31");
    const r1a = r.rubrics.find((x) => x.rubric === "1a");
    expect(r1a).toMatchObject({ base_cents: 80_000, vat_cents: 16_800 });
  });

  it("verlegde EU-omzet komt in 3b zonder BTW", () => {
    post({
      date: "2026-02-01",
      description: "EU B2B",
      source_type: "invoice",
      lines: [
        { account_code: "1300", debit_cents: 30_000 },
        { account_code: "8003", credit_cents: 30_000, vat_code: "0EU" },
      ],
    });
    const r = generateVatReport("2026-01-01", "2026-03-31");
    expect(r.rubrics.find((x) => x.rubric === "3b")).toMatchObject({
      base_cents: 30_000,
      vat_cents: 0,
    });
    expect(r.to_pay_cents).toBe(0);
  });
});

describe("submitVatQuarter", () => {
  it("boekt afdracht 1700 aan bank en sluit het kwartaal", () => {
    sale("2026-01-10", 100_000);
    purchase("2026-02-10", 20_000);

    const sub = submitVatQuarter({
      year: 2026,
      quarter: 1,
      paid_date: "2026-04-20",
    });
    expect(sub.to_pay_cents).toBe(21_000 - 4_200);
    expect(sub.payment_journal_id).not.toBeNull();

    const [payment] = listEntries({ source_type: "vat_submission" });
    expect(payment?.date).toBe("2026-04-20");
    const lines = Object.fromEntries(
      (payment?.lines ?? []).map((l) => [
        l.account_code,
        [l.debit_cents, l.credit_cents],
      ]),
    );
    expect(lines).toEqual({ "1700": [16_800, 0], "1100": [0, 16_800] });

    expect(isQuarterClosed(2026, 1)).toBe(true);
    expect(getVatSubmission(2026, 1)?.to_pay_cents).toBe(16_800);
  });

  it("boekt teruggaaf bank aan 1500 bij negatief saldo", () => {
    purchase("2026-02-10", 100_000);
    const sub = submitVatQuarter({
      year: 2026,
      quarter: 1,
      paid_date: "2026-04-20",
    });
    expect(sub.to_pay_cents).toBe(-21_000);
    const [refund] = listEntries({ source_type: "vat_submission" });
    const lines = Object.fromEntries(
      (refund?.lines ?? []).map((l) => [
        l.account_code,
        [l.debit_cents, l.credit_cents],
      ]),
    );
    expect(lines).toEqual({ "1100": [21_000, 0], "1500": [0, 21_000] });
  });

  it("saldo nul: geen boeking, wel kwartaal dicht", () => {
    const sub = submitVatQuarter({
      year: 2026,
      quarter: 1,
      paid_date: "2026-04-20",
    });
    expect(sub.payment_journal_id).toBeNull();
    expect(listEntries({ source_type: "vat_submission" })).toHaveLength(0);
    expect(isQuarterClosed(2026, 1)).toBe(true);
  });
});
