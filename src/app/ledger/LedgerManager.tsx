"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit3, Trash2, Check, X, EyeOff, Eye } from "lucide-react";
import type {
  Account,
  AccountType,
} from "@/lib/ledger/accounts";
import { formatEUR } from "@/lib/format";

type AccountWithBalance = Account & { balance_cents: number };

const TYPE_LABEL: Record<AccountType, string> = {
  asset: "Activa",
  liability: "Passiva (verplichtingen)",
  equity: "Eigen vermogen",
  income: "Omzet",
  expense: "Kosten",
};

const TYPE_ORDER: AccountType[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

export default function LedgerManager({
  initial,
}: {
  initial: AccountWithBalance[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountWithBalance[]>(initial);
  const [adding, setAdding] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Group per type
  const byType = new Map<AccountType, AccountWithBalance[]>();
  for (const a of accounts) {
    if (!showInactive && !a.active) continue;
    const arr = byType.get(a.type as AccountType) || [];
    arr.push(a);
    byType.set(a.type as AccountType, arr);
  }

  async function reload() {
    // Page refresh om server-side balansen opnieuw te berekenen
    router.refresh();
    // Local list bijwerken via fetch
    const r = await fetch("/api/ledger/accounts");
    if (r.ok) {
      const d = (await r.json()) as { accounts: Account[] };
      setAccounts(
        d.accounts.map((a) => ({
          ...a,
          balance_cents:
            accounts.find((x) => x.code === a.code)?.balance_cents ?? 0,
        })),
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setAdding(true);
            setEditingCode(null);
          }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Nieuwe rekening
        </button>
        <label className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Toon inactieve rekeningen
        </label>
      </div>

      {adding && (
        <AccountForm
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      {TYPE_ORDER.map((type) => {
        const list = byType.get(type) || [];
        if (list.length === 0) return null;
        const total = list
          .filter((a) => a.active)
          .reduce((s, a) => s + a.balance_cents, 0);
        return (
          <section
            key={type}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-zinc-900/40">
              <h2 className="text-sm font-semibold text-zinc-200">
                {TYPE_LABEL[type] || type}
              </h2>
              <span className="font-mono text-sm text-zinc-300">
                {formatEUR(total)}
              </span>
            </div>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{/* mobile-overflow */}<table className="w-full text-sm">
              <tbody>
                {list.map((a) =>
                  editingCode === a.code ? (
                    <tr
                      key={a.code}
                      className="border-t border-[var(--border)] bg-zinc-900/30"
                    >
                      <td colSpan={5} className="p-3">
                        <AccountForm
                          initial={a}
                          onCancel={() => setEditingCode(null)}
                          onSaved={async () => {
                            setEditingCode(null);
                            await reload();
                          }}
                          onDeleted={async () => {
                            setEditingCode(null);
                            await reload();
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={a.code}
                      className={`border-t border-[var(--border)] ${
                        !a.active ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-zinc-500 w-20">
                        {a.code}
                      </td>
                      <td className="px-4 py-2 text-zinc-200">
                        <Link
                          href={`/ledger/${a.code}`}
                          className="hover:text-emerald-300"
                        >
                          {a.name}
                        </Link>
                        {a.default_vat_rate !== null && (
                          <span className="ml-2 text-[10px] text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">
                            {a.default_vat_rate}%
                          </span>
                        )}
                        {!a.active && (
                          <span className="ml-2 text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">
                            inactief
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-300 w-32">
                        {formatEUR(a.balance_cents)}
                      </td>
                      <td className="px-2 py-2 w-24 text-right">
                        <button
                          onClick={() => {
                            setEditingCode(a.code);
                            setAdding(false);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-zinc-200 rounded"
                          title="Bewerken"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table></div>
          </section>
        );
      })}
    </div>
  );
}

function AccountForm({
  initial,
  onCancel,
  onSaved,
  onDeleted,
}: {
  initial?: Account;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
  onDeleted?: () => Promise<void> | void;
}) {
  const isEdit = !!initial;
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState<AccountType>(
    (initial?.type as AccountType) || "expense",
  );
  const [vatRate, setVatRate] = useState<string>(
    initial?.default_vat_rate !== null && initial?.default_vat_rate !== undefined
      ? String(initial.default_vat_rate)
      : "",
  );
  const [active, setActive] = useState<boolean>(initial?.active !== 0);
  const [description, setDescription] = useState(initial?.description || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSave() {
    setErr("");
    if (!code.trim() || !/^\d{3,5}$/.test(code.trim())) {
      setErr("Code moet 3-5 cijfers zijn");
      return;
    }
    if (!name.trim()) {
      setErr("Naam is verplicht");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        type,
        default_vat_rate: vatRate ? parseInt(vatRate) : null,
        active: active ? 1 : 0,
        description: description.trim() || null,
      };
      const url = isEdit
        ? `/api/ledger/accounts/${initial!.code}`
        : `/api/ledger/accounts`;
      const method = isEdit ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Opslaan mislukt");
        return;
      }
      await onSaved();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!initial || !onDeleted) return;
    if (
      !confirm(
        `Rekening ${initial.code} ${initial.name} verwijderen?\n\nKan alleen als 'ie nooit is gebruikt in een boeking. Tip: zet 'm anders op inactief.`,
      )
    )
      return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/ledger/accounts/${initial.code}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Verwijderen mislukt");
        return;
      }
      await onDeleted();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-emerald-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">
          {isEdit ? `Rekening ${initial!.code} bewerken` : "Nieuwe rekening"}
        </h2>
        <button
          onClick={onCancel}
          className="p-1 text-zinc-500 hover:text-zinc-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Code (4-cijfer)" required>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
            disabled={isEdit}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono disabled:opacity-50"
            placeholder="4600"
          />
          {isEdit && (
            <p className="text-[10px] text-zinc-600 mt-1">
              Code is niet wijzigbaar — verwijder en maak opnieuw aan voor
              een andere code
            </p>
          )}
        </Field>
        <Field label="Naam" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ICT-software & SaaS"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </Field>
        <Field label="Type" required>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            <option value="asset">Activa (1xxx)</option>
            <option value="liability">Passiva (1500/1600/1700/1900)</option>
            <option value="equity">Eigen vermogen</option>
            <option value="expense">Kosten (4xxx, 7xxx)</option>
            <option value="income">Omzet (8xxx, 9xxx)</option>
          </select>
        </Field>
        <Field label="Standaard BTW">
          <select
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            <option value="">Geen / n.v.t.</option>
            <option value="21">21%</option>
            <option value="9">9%</option>
            <option value="0">0%</option>
          </select>
        </Field>
      </div>
      <Field label="Omschrijving (optioneel)">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
        />
      </Field>
      <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        {active ? (
          <span className="inline-flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> Actief — verschijnt in keuze­lijsten
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <EyeOff className="w-3.5 h-3.5" /> Inactief — verborgen, data
            blijft staan
          </span>
        )}
      </label>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
        <button
          onClick={onSave}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          {busy ? "..." : "Opslaan"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm"
        >
          Annuleren
        </button>
        {isEdit && onDeleted && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-red-400 hover:bg-red-500/10 text-sm rounded-lg"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Verwijderen
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
