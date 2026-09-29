import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, resetLedger } from "@/test/db";
import {
  getAccountLedger,
  getEntryWithLines,
  post,
  reverseEntry,
  type PostInput,
} from "./journal";
import { getDb } from "@/lib/db";

function entry(overrides: Partial<PostInput> = {}): PostInput {
  return {
    date: "2026-03-15",
    description: "Test boeking",
    source_type: "manual",
    lines: [
      { account_code: "4000", debit_cents: 10_000 },
      { account_code: "1100", credit_cents: 10_000 },
    ],
    ...overrides,
  };
}

beforeAll(() => {
  initTestDb();
});
beforeEach(() => {
  resetLedger();
});

describe("journal.post — validatie (regel 1: double-entry in balans)", () => {
  it("boekt een gebalanceerde entry met alle regels", () => {
    const e = post(entry());
    expect(e.lines).toHaveLength(2);
    const debit = e.lines.reduce((s, l) => s + l.debit_cents, 0);
    const credit = e.lines.reduce((s, l) => s + l.credit_cents, 0);
    expect(debit).toBe(10_000);
    expect(credit).toBe(10_000);
    expect(e.tenant_id).toBe("default");
  });

  it("weigert een onbalans en schrijft niets weg", () => {
    expect(() =>
      post(
        entry({
          lines: [
            { account_code: "4000", debit_cents: 10_000 },
            { account_code: "1100", credit_cents: 9_999 },
          ],
        }),
      ),
    ).toThrow(/onbalans/);
    const n = getDb()
      .prepare("SELECT COUNT(*) AS n FROM journal_entries")
      .get() as { n: number };
    expect(n.n).toBe(0);
  });

  it("weigert minder dan 2 regels", () => {
    expect(() =>
      post(entry({ lines: [{ account_code: "4000", debit_cents: 0 }] })),
    ).toThrow(/minstens 2 regels/);
  });

  it("weigert negatieve bedragen", () => {
    expect(() =>
      post(
        entry({
          lines: [
            { account_code: "4000", debit_cents: -100 },
            { account_code: "1100", credit_cents: -100 },
          ],
        }),
      ),
    ).toThrow(/≥ 0/);
  });

  it("weigert een regel met zowel debet als credit", () => {
    expect(() =>
      post(
        entry({
          lines: [
            { account_code: "4000", debit_cents: 100, credit_cents: 100 },
            { account_code: "1100", credit_cents: 0, debit_cents: 0 },
          ],
        }),
      ),
    ).toThrow(/tegelijk debet én credit/);
  });

  it("weigert lege regels", () => {
    expect(() =>
      post(
        entry({
          lines: [
            { account_code: "4000", debit_cents: 100 },
            { account_code: "1100", credit_cents: 100 },
            { account_code: "1500" },
          ],
        }),
      ),
    ).toThrow(/Lege regel/);
  });

  it("weigert een ongeldige datum", () => {
    expect(() => post(entry({ date: "maart" }))).toThrow(/Ongeldige datum/);
  });

  it("accepteert multi-line splits (factuur met 21% en 9%)", () => {
    const e = post(
      entry({
        lines: [
          { account_code: "1300", debit_cents: 12_100 + 5_450 },
          { account_code: "8000", credit_cents: 10_000, vat_code: "21" },
          { account_code: "1700", credit_cents: 2_100, vat_code: "21" },
          { account_code: "8001", credit_cents: 5_000, vat_code: "9" },
          { account_code: "1700", credit_cents: 450, vat_code: "9" },
        ],
      }),
    );
    expect(e.lines).toHaveLength(5);
  });
});

describe("journal.post — periodes (regel 3: afgesloten periodes blijven dicht)", () => {
  it("zaait een open periode bij de eerste boeking", () => {
    post(entry({ date: "2026-05-02" }));
    const p = getDb()
      .prepare(
        "SELECT status FROM accounting_periods WHERE tenant_id='default' AND year=2026 AND month=5",
      )
      .get() as { status: string } | undefined;
    expect(p?.status).toBe("open");
  });

  it("weigert boekingen in een afgesloten maand", () => {
    getDb()
      .prepare(
        "INSERT INTO accounting_periods (tenant_id, year, month, status) VALUES ('default', 2026, 2, 'closed')",
      )
      .run();
    expect(() => post(entry({ date: "2026-02-28" }))).toThrow(/afgesloten/);
    // Aangrenzende maand blijft gewoon open
    expect(() => post(entry({ date: "2026-03-01" }))).not.toThrow();
  });
});

describe("reverseEntry (regel 2: correcties via tegenboeking)", () => {
  it("maakt een gespiegelde boeking en koppelt beide", () => {
    const original = post(entry());
    const reversal = reverseEntry(original.id, "verkeerde rekening");

    const byAccount = (lines: typeof reversal.lines) =>
      Object.fromEntries(
        lines.map((l) => [l.account_code, [l.debit_cents, l.credit_cents]]),
      );
    expect(byAccount(reversal.lines)).toEqual({
      "4000": [0, 10_000],
      "1100": [10_000, 0],
    });

    expect(getEntryWithLines(original.id)?.reversed_by).toBe(reversal.id);
    expect(getEntryWithLines(reversal.id)?.reverses_id).toBe(original.id);

    // Origineel blijft bestaan (geen DELETE — audit trail)
    expect(getEntryWithLines(original.id)).not.toBeNull();
  });

  it("weigert dubbel reverseren", () => {
    const original = post(entry());
    reverseEntry(original.id, "fout");
    expect(() => reverseEntry(original.id, "nogmaals")).toThrow(
      /al gereverseerd/,
    );
  });

  it("weigert een reversal te reverseren", () => {
    const original = post(entry());
    const reversal = reverseEntry(original.id, "fout");
    expect(() => reverseEntry(reversal.id, "terug")).toThrow(
      /kan zelf niet/,
    );
  });

  it("netto saldo is nul na origineel + tegenboeking", () => {
    const original = post(entry());
    reverseEntry(original.id, "fout");
    const ledger = getAccountLedger("4000", "2000-01-01", "2999-12-31");
    expect(ledger.ending_balance_cents).toBe(0);
  });
});

describe("getAccountLedger (grootboekkaart)", () => {
  it("berekent beginsaldo, lopend saldo en eindsaldo", () => {
    post(entry({ date: "2026-01-10" })); // 4000 +100,00 vóór periode
    post(entry({ date: "2026-02-10" })); // +100,00
    post(
      entry({
        date: "2026-02-20",
        lines: [
          { account_code: "1100", debit_cents: 2_500 },
          { account_code: "4000", credit_cents: 2_500 },
        ],
      }),
    ); // -25,00
    post(entry({ date: "2026-03-10" })); // na periode

    const l = getAccountLedger("4000", "2026-02-01", "2026-02-28");
    expect(l.opening_balance_cents).toBe(10_000);
    expect(l.lines.map((x) => x.running_balance_cents)).toEqual([
      20_000, 17_500,
    ]);
    expect(l.ending_balance_cents).toBe(17_500);
  });
});
