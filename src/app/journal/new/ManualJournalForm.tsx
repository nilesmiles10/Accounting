"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Send } from "lucide-react";
import type { Account } from "@/lib/ledger/accounts";
import type { Company } from "@/lib/companies";
import { formatEUR } from "@/lib/format";

interface DraftLine {
  account_code: string;
  description: string;
  debit_eur: string; // string voor input control
  credit_eur: string;
}

const EMPTY_LINE: DraftLine = {
  account_code: "",
  description: "",
  debit_eur: "",
  credit_eur: "",
};

function eurToCents(v: string): number {
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function ManualJournalForm({
  accounts,
  companies,
}: {
  accounts: Account[];
  companies: Company[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState<"manual" | "opening">(
    "manual",
  );
  const [companyId, setCompanyId] = useState<string>(
    companies.length === 1 ? (companies[0]?.id ?? "") : "",
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const totals = lines.reduce(
    (acc, l) => {
      acc.debit += eurToCents(l.debit_eur);
      acc.credit += eurToCents(l.credit_eur);
      return acc;
    },
    { debit: 0, credit: 0 },
  );
  const diff = totals.debit - totals.credit;
  const balanced = totals.debit > 0 && diff === 0;

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((arr) => [...arr, { ...EMPTY_LINE }]);
  }
  function removeLine(i: number) {
    if (lines.length <= 2) return;
    setLines((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!description.trim()) {
      setErr("Omschrijving verplicht");
      return;
    }
    if (!balanced) {
      setErr(
        diff === 0
          ? "Voer bedragen in"
          : `Niet in balans — verschil ${formatEUR(Math.abs(diff))}`,
      );
      return;
    }
    const apiLines = lines
      .filter((l) => l.account_code && (l.debit_eur || l.credit_eur))
      .map((l) => ({
        account_code: l.account_code,
        description: l.description || null,
        debit_cents: eurToCents(l.debit_eur),
        credit_cents: eurToCents(l.credit_eur),
      }));
    if (apiLines.some((l) => !l.account_code)) {
      setErr("Elke regel heeft een grootboekrekening nodig");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          description,
          source_type: sourceType,
          company_id: companyId || null,
          notes: notes || null,
          lines: apiLines,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Boeking mislukt");
        return;
      }
      router.push("/journal");
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4"
    >
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Boekdatum</span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </label>
        <label className="block col-span-2">
          <span className="block text-xs text-zinc-500 mb-1">Omschrijving</span>
          <input
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="bv. Openingsbalans 2026 of Correctie boeking #12"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Type</span>
          <select
            value={sourceType}
            onChange={(e) =>
              setSourceType(e.target.value as "manual" | "opening")
            }
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            <option value="manual">Correctie / overige boeking</option>
            <option value="opening">Openingsbalans</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Bedrijf (voor P&L per bedrijf)
          </span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            <option value="">— niet gekoppeld —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border border-[var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/40 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Rekening</th>
              <th className="text-left px-3 py-2 font-medium">Omschrijving</th>
              <th className="text-right px-3 py-2 font-medium w-28">Debet €</th>
              <th className="text-right px-3 py-2 font-medium w-28">Credit €</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="px-2 py-1.5">
                  <select
                    value={line.account_code}
                    onChange={(e) =>
                      updateLine(i, { account_code: e.target.value })
                    }
                    className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200"
                  >
                    <option value="">— kies —</option>
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) =>
                      updateLine(i, { description: e.target.value })
                    }
                    className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.debit_eur}
                    onChange={(e) =>
                      updateLine(i, {
                        debit_eur: e.target.value,
                        credit_eur: e.target.value ? "" : line.credit_eur,
                      })
                    }
                    className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 text-right font-mono"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.credit_eur}
                    onChange={(e) =>
                      updateLine(i, {
                        credit_eur: e.target.value,
                        debit_eur: e.target.value ? "" : line.debit_eur,
                      })
                    }
                    className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 text-right font-mono"
                  />
                </td>
                <td className="px-1 py-1.5">
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="p-1 text-zinc-500 hover:text-red-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t border-[var(--border)] bg-zinc-900/40">
              <td colSpan={2} className="px-3 py-2 text-xs text-zinc-500">
                Totaal
              </td>
              <td className="px-3 py-2 text-right font-mono text-zinc-300">
                {formatEUR(totals.debit)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-zinc-300">
                {formatEUR(totals.credit)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-emerald-300"
        >
          <Plus className="w-3.5 h-3.5" />
          Regel toevoegen
        </button>
        <span
          className={
            balanced
              ? "text-emerald-400"
              : diff === 0
                ? "text-zinc-500"
                : "text-amber-300"
          }
        >
          {balanced
            ? "✓ In balans"
            : diff === 0
              ? "Voer bedragen in"
              : `Verschil: ${formatEUR(Math.abs(diff))}`}
        </span>
      </div>

      <label className="block">
        <span className="block text-xs text-zinc-500 mb-1">
          Notities (optioneel)
        </span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="bv. Naar aanleiding van controle accountant"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
        />
      </label>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
          {err}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || !balanced}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
          {busy ? "Boeken..." : "Boeking maken"}
        </button>
      </div>
    </form>
  );
}
