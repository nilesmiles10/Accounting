import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, makeClient, resetLedger } from "@/test/db";
import { getDb } from "@/lib/db";
import {
  calculateLine,
  calculateTotals,
  cancelInvoice,
  createCreditNoteFromInvoice,
  createDraft,
  finalizeInvoice,
  updateDraft,
  type LineInput,
} from "./invoices";
import { listEntries } from "@/lib/ledger/journal";
import { generateVatReport } from "@/lib/reports/vat";
import { checkNumberingIntegrity } from "@/lib/reports/numbering";

const COMPANY = "intersumma"; // geseed door db.ts, prefix "INT-"

const line = (overrides: Partial<LineInput> = {}): LineInput => ({
  description: "Consultancy",
  quantity_milli: 1000,
  unit_price_cents: 10_000,
  vat_rate: 21,
  ...overrides,
});

let clientId: string;

beforeAll(() => {
  initTestDb();
  clientId = makeClient().id;
});
beforeEach(() => {
  resetLedger();
  const db = getDb();
  db.exec("DELETE FROM invoice_events; DELETE FROM invoice_lines; DELETE FROM invoices;");
  db.prepare(
    "UPDATE companies SET invoice_number_next = 1, invoice_number_padding = 4 WHERE id = ?",
  ).run(COMPANY);
});

describe("calculateLine / calculateTotals (regel 10: geld in centen)", () => {
  it("rekent qty × prijs en BTW in hele centen", () => {
    expect(calculateLine(line(), "standard")).toEqual({
      line_total_cents: 10_000,
      line_vat_cents: 2_100,
    });
  });

  it("ondersteunt fractionele aantallen (quantity_milli)", () => {
    // 1,5 uur × € 85,00 = € 127,50; 21% = € 26,775 → 26,78
    expect(
      calculateLine(
        line({ quantity_milli: 1500, unit_price_cents: 8_500 }),
        "standard",
      ),
    ).toEqual({ line_total_cents: 12_750, line_vat_cents: 2_678 });
  });

  it("forceert 0% BTW bij verlegging en export", () => {
    expect(calculateLine(line(), "reverse_charge_eu").line_vat_cents).toBe(0);
    expect(calculateLine(line(), "export_outside_eu").line_vat_cents).toBe(0);
  });

  it("telt gemengde tarieven op", () => {
    const t = calculateTotals(
      [line(), line({ unit_price_cents: 5_000, vat_rate: 9 })],
      "standard",
    );
    expect(t).toEqual({
      subtotal_cents: 15_000,
      vat_total_cents: 2_100 + 450,
      total_cents: 17_550,
    });
  });
});

describe("finalizeInvoice — nummering (regel 8: sequentieel zonder gaten)", () => {
  function finalized(issue_date = "2026-03-10") {
    const d = createDraft({
      company_id: COMPANY,
      client_id: clientId,
      issue_date,
      lines: [line()],
    });
    return finalizeInvoice(d.id);
  }

  it("kent opeenvolgende nummers toe met prefix, jaar en padding", () => {
    expect(finalized().number).toBe("INT-2026-0001");
    expect(finalized().number).toBe("INT-2026-0002");
    expect(finalized().number).toBe("INT-2026-0003");
    expect(checkNumberingIntegrity().total_gaps).toBe(0);
  });

  it("concepten verbruiken geen nummer", () => {
    createDraft({ company_id: COMPANY, client_id: clientId, lines: [line()] });
    const d = createDraft({ company_id: COMPANY, client_id: clientId, lines: [line()] });
    expect(d.number).toMatch(/^DRAFT-/);
    expect(finalized().number).toBe("INT-2026-0001");
  });

  it("weigert finaliseren zonder regels en verbruikt dan geen nummer", () => {
    const empty = createDraft({ company_id: COMPANY, client_id: clientId });
    expect(() => finalizeInvoice(empty.id)).toThrow(/geen regels/);
    expect(finalized().number).toBe("INT-2026-0001");
  });

  it("weigert dubbel finaliseren", () => {
    const inv = finalized();
    expect(() => finalizeInvoice(inv.id)).toThrow(/Alleen concept/);
  });

  it("gefinaliseerde factuur is niet meer bewerkbaar (regel 4)", () => {
    const inv = finalized();
    expect(() => updateDraft(inv.id, { notes: "gewijzigd" })).toThrow(
      /Alleen concept/,
    );
  });

  it("bevriest company- en client-snapshot", () => {
    const inv = finalized();
    const row = getDb()
      .prepare(
        "SELECT company_snapshot_json, client_snapshot_json FROM invoices WHERE id = ?",
      )
      .get(inv.id) as { company_snapshot_json: string; client_snapshot_json: string };
    expect(JSON.parse(row.company_snapshot_json).id).toBe(COMPANY);
    expect(JSON.parse(row.client_snapshot_json).id).toBe(clientId);
  });

  it("geannuleerde factuur telt niet als gat", () => {
    finalized();
    const second = finalized();
    finalized();
    cancelInvoice(second.id);
    const report = checkNumberingIntegrity();
    expect(report.total_gaps).toBe(0);
    expect(report.series[0]?.cancelled_count).toBe(1);
  });
});

describe("finalizeInvoice — auto-journalisatie", () => {
  it("boekt 1300 aan 8000/8001 + 1700 op de factuurdatum (regel 11)", () => {
    const d = createDraft({
      company_id: COMPANY,
      client_id: clientId,
      issue_date: "2026-02-14",
      lines: [line(), line({ unit_price_cents: 5_000, vat_rate: 9 })],
    });
    const inv = finalizeInvoice(d.id);
    const [entry] = listEntries({ source_id: inv.id });
    expect(entry?.date).toBe("2026-02-14");

    const sum = (code: string, side: "debit_cents" | "credit_cents") =>
      (entry?.lines ?? [])
        .filter((l) => l.account_code === code)
        .reduce((s, l) => s + l[side], 0);
    expect(sum("1300", "debit_cents")).toBe(17_550);
    expect(sum("8000", "credit_cents")).toBe(10_000);
    expect(sum("8001", "credit_cents")).toBe(5_000);
    expect(sum("1700", "credit_cents")).toBe(2_550);

    // BTW-code staat op de regel, niet afgeleid uit rekening (regel 6)
    const vatCodes = (entry?.lines ?? [])
      .filter((l) => l.account_code === "1700")
      .map((l) => l.vat_code)
      .sort();
    expect(vatCodes).toEqual(["21", "9"]);
  });

  it("EU-verlegging boekt op 8003 met vat_code 0EU en zonder 1700", () => {
    const d = createDraft({
      company_id: COMPANY,
      client_id: clientId,
      issue_date: "2026-02-14",
      vat_treatment: "reverse_charge_eu",
      lines: [line()],
    });
    const inv = finalizeInvoice(d.id);
    const [entry] = listEntries({ source_id: inv.id });
    const codes = (entry?.lines ?? []).map((l) => l.account_code).sort();
    expect(codes).toEqual(["1300", "8003"]);
    expect(entry?.lines.find((l) => l.account_code === "8003")?.vat_code).toBe(
      "0EU",
    );
  });

  it("creditnota draait de boeking om en neemt het volgende nummer", () => {
    const d = createDraft({
      company_id: COMPANY,
      client_id: clientId,
      issue_date: "2026-02-14",
      lines: [line()],
    });
    const inv = finalizeInvoice(d.id);
    const cn = finalizeInvoice(createCreditNoteFromInvoice(inv.id).id);
    expect(cn.number).toBe("INT-2026-0002");

    const [entry] = listEntries({ source_id: cn.id });
    const byAccount = Object.fromEntries(
      (entry?.lines ?? []).map((l) => [
        l.account_code,
        [l.debit_cents, l.credit_cents],
      ]),
    );
    expect(byAccount).toEqual({
      "1300": [0, 12_100],
      "8000": [10_000, 0],
      "1700": [2_100, 0],
    });

    // Factuur + creditnota → netto nul in de BTW-aangifte
    const vat = generateVatReport("2026-01-01", "2026-12-31");
    expect(vat.to_pay_cents).toBe(0);
  });

  it("annuleren reverseert de journaalpost (geen DELETE)", () => {
    const d = createDraft({
      company_id: COMPANY,
      client_id: clientId,
      issue_date: "2026-02-14",
      lines: [line()],
    });
    const inv = finalizeInvoice(d.id);
    cancelInvoice(inv.id);
    const entries = listEntries({ source_id: inv.id });
    expect(entries).toHaveLength(2);
    expect(entries.some((e) => e.reverses_id)).toBe(true);
    const vat = generateVatReport("2026-01-01", "2026-12-31");
    expect(vat.to_pay_cents).toBe(0);
  });
});
