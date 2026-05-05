"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import type { Account } from "@/lib/ledger/accounts";

type Category = "inventaris" | "ict" | "machines" | "voertuigen" | "overig";

const CATEGORY_INFO: Record<
  Category,
  {
    label: string;
    years: number;
    asset: string;
    cum: string;
    expense: string;
  }
> = {
  inventaris: {
    label: "Inventaris (meubilair, kantoorinrichting)",
    years: 5,
    asset: "0500",
    cum: "0501",
    expense: "4350",
  },
  ict: {
    label: "ICT (laptop, telefoon, server)",
    years: 3,
    asset: "0500",
    cum: "0501",
    expense: "4350",
  },
  machines: {
    label: "Machines & installaties",
    years: 7,
    asset: "0510",
    cum: "0511",
    expense: "4350",
  },
  voertuigen: {
    label: "Voertuigen",
    years: 5,
    asset: "0520",
    cum: "0521",
    expense: "4350",
  },
  overig: {
    label: "Overig",
    years: 5,
    asset: "0500",
    cum: "0501",
    expense: "4350",
  },
};

function eurToCents(v: string): number {
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

export default function NewAssetForm({
  accounts,
}: {
  accounts: Account[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState<Category>("ict");
  const info = CATEGORY_INFO[category];
  const [code, setCode] = useState(`ASSET-${new Date().getFullYear()}-001`);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [years, setYears] = useState(String(info.years));
  const [residual, setResidual] = useState("");
  const [assetCode, setAssetCode] = useState(info.asset);
  const [cumCode, setCumCode] = useState(info.cum);
  const [expenseCode, setExpenseCode] = useState(info.expense);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Update defaults wanneer category wijzigt
  function changeCategory(c: Category) {
    setCategory(c);
    const i = CATEGORY_INFO[c];
    setYears(String(i.years));
    setAssetCode(i.asset);
    setCumCode(i.cum);
    setExpenseCode(i.expense);
  }

  const purchaseCents = eurToCents(purchaseAmount);
  const residualCents = eurToCents(residual);
  const yearsNum = Number(years.replace(",", ".")) || 0;
  const monthlyDep =
    yearsNum > 0
      ? Math.round((purchaseCents - residualCents) / (yearsNum * 12))
      : 0;
  const yearlyDep = monthlyDep * 12;

  const assetAccounts = useMemo(
    () => accounts.filter((a) => a.type === "asset"),
    [accounts],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.type === "expense"),
    [accounts],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (purchaseCents <= 0) {
      setErr("Aanschafbedrag moet groter zijn dan 0");
      return;
    }
    if (yearsNum <= 0) {
      setErr("Levensduur moet groter zijn dan 0 jaar");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          description: description || null,
          category,
          purchase_date: purchaseDate,
          purchase_amount_cents: purchaseCents,
          useful_life_years: yearsNum,
          residual_value_cents: residualCents,
          asset_account_code: assetCode,
          depreciation_account_code: cumCode,
          expense_account_code: expenseCode,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Aanmaken mislukt");
        return;
      }
      router.push(`/assets/${d.asset.id}`);
      router.refresh();
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Code</span>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Categorie</span>
          <select
            value={category}
            onChange={(e) => changeCategory(e.target.value as Category)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            {(Object.keys(CATEGORY_INFO) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_INFO[c].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="block text-xs text-zinc-500 mb-1">Naam</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="bv. MacBook Pro 16 inch (Niels)"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
        />
      </label>

      <label className="block">
        <span className="block text-xs text-zinc-500 mb-1">
          Omschrijving (optioneel)
        </span>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Apple invoice nummer, serienummer, etc."
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Aanschafdatum
          </span>
          <input
            type="date"
            required
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Aanschafbedrag (excl BTW)
          </span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={purchaseAmount}
            onChange={(e) => setPurchaseAmount(e.target.value)}
            placeholder="2499,00"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Restwaarde (€, optioneel)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={residual}
            onChange={(e) => setResidual(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono"
          />
        </label>
      </div>

      <label className="block max-w-xs">
        <span className="block text-xs text-zinc-500 mb-1">
          Levensduur (jaren)
        </span>
        <input
          type="text"
          inputMode="decimal"
          required
          value={years}
          onChange={(e) => setYears(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono"
        />
      </label>

      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200 text-xs">
          Geavanceerd: grootboekrekeningen overschrijven
        </summary>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">
              Activum (debet aanschaf)
            </span>
            <select
              value={assetCode}
              onChange={(e) => setAssetCode(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200"
            >
              {assetAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">
              Cum. afschrijving (credit)
            </span>
            <select
              value={cumCode}
              onChange={(e) => setCumCode(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200"
            >
              {assetAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">
              Afschrijvingskosten (debet maand)
            </span>
            <select
              value={expenseCode}
              onChange={(e) => setExpenseCode(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200"
            >
              {expenseAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {purchaseCents > 0 && yearsNum > 0 && (
        <div className="bg-zinc-900/40 border border-[var(--border)] rounded-lg p-3 text-xs space-y-1">
          <p className="text-zinc-300 font-semibold">Voorbeeld berekening</p>
          <p className="text-zinc-400">
            Per maand: <span className="font-mono">{fmtEur(monthlyDep)}</span>
          </p>
          <p className="text-zinc-400">
            Per jaar: <span className="font-mono">{fmtEur(yearlyDep)}</span>
          </p>
          <p className="text-zinc-500 text-[11px]">
            Maandelijkse boeking: Debet {expenseCode} / Credit {cumCode}
          </p>
        </div>
      )}

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
          {err}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
          {busy ? "Aanmaken..." : "Asset aanmaken"}
        </button>
      </div>
    </form>
  );
}
