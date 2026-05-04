"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, X, Edit3 } from "lucide-react";
import type { Company } from "@/lib/companies";
import type { Item } from "@/lib/items";
import {
  formatEUR,
  parseEuroInput,
} from "@/lib/format";

export default function ItemsManager({
  companies,
  activeCompanyId,
  initialItems,
}: {
  companies: Company[];
  activeCompanyId: string;
  initialItems: Item[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(activeCompanyId);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/items?company_id=${companyId}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []));
  }, [companyId]);

  function onCompanyChange(id: string) {
    setCompanyId(id);
    const params = new URLSearchParams();
    if (id) params.set("company_id", id);
    router.replace(`/settings/items?${params.toString()}`);
  }

  async function reload() {
    const res = await fetch(`/api/items?company_id=${companyId}`);
    if (res.ok) setItems((await res.json()).items);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm">
          <span className="block text-xs text-zinc-500 mb-1">Bedrijf</span>
          <select
            value={companyId}
            onChange={(e) => onCompanyChange(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors self-end"
        >
          <Plus className="w-4 h-4" />
          Nieuw item
        </button>
      </div>

      {adding && (
        <ItemForm
          companyId={companyId}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      {items.length === 0 && !adding && (
        <div className="text-center py-12 text-sm text-zinc-500 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          Nog geen items in de catalog.
        </div>
      )}

      <div className="space-y-2">
        {items.map((it) =>
          editingId === it.id ? (
            <ItemForm
              key={it.id}
              companyId={companyId}
              initial={it}
              onCancel={() => setEditingId(null)}
              onSaved={async () => {
                setEditingId(null);
                await reload();
              }}
            />
          ) : (
            <ItemRow
              key={it.id}
              item={it}
              onEdit={() => {
                setEditingId(it.id);
                setAdding(false);
              }}
              onDeleted={reload}
            />
          ),
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  onEdit,
  onDeleted,
}: {
  item: Item;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [error, setError] = useState("");

  async function onDelete() {
    if (!confirm(`Item "${item.name}" verwijderen?`)) return;
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Verwijderen mislukt");
        return;
      }
      await onDeleted();
    } catch {
      setError("Verbindingsfout");
    }
  }

  async function toggleActive() {
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: item.active ? 0 : 1 }),
    });
    await onDeleted();
  }

  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3 ${
        item.active ? "" : "opacity-50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-zinc-100">
            {item.name}
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
            {item.vat_rate}% BTW
          </span>
          {!item.active && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
              inactief
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-zinc-400 mt-1">{item.description}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1.5">
          <span className="font-mono text-zinc-300">
            {formatEUR(item.unit_price_cents)}
          </span>
          <span>/ {item.unit || "stuk"}</span>
        </div>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleActive}
          className="text-[11px] px-2 py-1 text-zinc-500 hover:text-zinc-200 rounded-md hover:bg-white/5 transition-colors"
        >
          {item.active ? "Deactiveren" : "Activeren"}
        </button>
        <button
          onClick={onEdit}
          className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ItemForm({
  companyId,
  initial,
  onCancel,
  onSaved,
}: {
  companyId: string;
  initial?: Item;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [unit, setUnit] = useState(initial?.unit || "stuk");
  const [priceDraft, setPriceDraft] = useState(
    initial
      ? (initial.unit_price_cents / 100).toFixed(2).replace(".", ",")
      : "0,00",
  );
  const [vatRate, setVatRate] = useState(initial?.vat_rate ?? 21);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);

  async function onSave() {
    setError("");
    if (!name.trim()) {
      setError("Naam verplicht");
      return;
    }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
      unit: unit.trim() || null,
      unit_price_cents: parseEuroInput(priceDraft),
      vat_rate: vatRate,
    };
    try {
      const res = isEdit
        ? await fetch(`/api/items/${initial!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Opslaan mislukt");
        return;
      }
      await onSaved();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-[var(--surface)] border border-emerald-500/30 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">
          {isEdit ? "Item bewerken" : "Nieuw item"}
        </h2>
        <button
          onClick={onCancel}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Naam">
          <input
            ref={ref}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="bv. Consultancy uur"
            className="input"
          />
        </Field>
        <Field label="Eenheid">
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="uur / stuk / dag"
            className="input"
          />
        </Field>
        <Field label="Stukprijs excl. BTW">
          <input
            type="text"
            inputMode="decimal"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            className="input text-right font-mono"
          />
        </Field>
        <Field label="BTW-tarief">
          <select
            value={vatRate}
            onChange={(e) => setVatRate(parseInt(e.target.value) || 0)}
            className="select"
          >
            <option value="21">21%</option>
            <option value="9">9%</option>
            <option value="0">0%</option>
          </select>
        </Field>
      </div>
      <Field label="Omschrijving (optioneel — komt op factuur)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="input"
        />
      </Field>
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
        >
          <Check className="w-4 h-4" />
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
        >
          Annuleren
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: rgb(24 24 27);
          border: 1px solid rgb(63 63 70);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: rgb(228 228 231);
        }
        :global(.select) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: rgb(24 24 27);
          border: 1px solid rgb(63 63 70);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: rgb(228 228 231);
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
