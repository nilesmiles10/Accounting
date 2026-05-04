"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  Check,
  Building2,
} from "lucide-react";
import { formatEUR } from "@/lib/format";
import type {
  Supplier,
  SupplierUpdate,
} from "@/lib/suppliers";

type ListItem = Supplier & {
  invoice_count: number;
  total_spent_cents: number;
};

export default function SuppliersManager({
  initial,
}: {
  initial: ListItem[];
}) {
  const router = useRouter();
  const [list, setList] = useState<ListItem[]>(initial);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const url = search
        ? `/api/suppliers?q=${encodeURIComponent(search)}`
        : "/api/suppliers";
      const r = await fetch(url);
      if (r.ok) setList((await r.json()).suppliers);
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [search]);

  async function reload() {
    const r = await fetch("/api/suppliers");
    if (r.ok) setList((await r.json()).suppliers);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op naam, KvK, BTW..."
            className="w-full pl-10 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </div>
        <button
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Nieuwe leverancier
        </button>
      </div>

      {adding && (
        <SupplierForm
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      {list.length === 0 && !adding && (
        <div className="text-center py-12 text-sm text-zinc-500 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          Nog geen leveranciers.
        </div>
      )}

      <div className="space-y-2">
        {list.map((s) =>
          editingId === s.id ? (
            <SupplierForm
              key={s.id}
              initial={s}
              onCancel={() => setEditingId(null)}
              onSaved={async () => {
                setEditingId(null);
                await reload();
              }}
            />
          ) : (
            <SupplierRow
              key={s.id}
              s={s}
              onEdit={() => {
                setEditingId(s.id);
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

function SupplierRow({
  s,
  onEdit,
  onDeleted,
}: {
  s: ListItem;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [error, setError] = useState("");

  async function onDelete() {
    if (!confirm(`Leverancier "${s.name}" verwijderen?`)) return;
    try {
      const r = await fetch(`/api/suppliers/${s.id}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Verwijderen mislukt");
        return;
      }
      await onDeleted();
    } catch {
      setError("Verbindingsfout");
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3">
      <Building2 className="w-4 h-4 text-zinc-500 mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-zinc-100">{s.name}</h3>
          {s.vat_number && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              {s.vat_number}
            </span>
          )}
          {s.invoice_count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
              {s.invoice_count} factur{s.invoice_count === 1 ? "" : "en"} ·{" "}
              {formatEUR(s.total_spent_cents)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 flex-wrap">
          {s.email && <span>{s.email}</span>}
          {s.iban && <span className="font-mono">{s.iban}</span>}
          {s.default_account_code && (
            <span>→ {s.default_account_code}</span>
          )}
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
      <div className="flex gap-1">
        <button
          onClick={onEdit}
          className="p-2 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SupplierForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Supplier;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<SupplierUpdate & { name: string }>({
    name: initial?.name || "",
    legal_name: initial?.legal_name || "",
    contact_name: initial?.contact_name || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    kvk: initial?.kvk || "",
    vat_number: initial?.vat_number || "",
    iban: initial?.iban || "",
    address_line1: initial?.address_line1 || "",
    postal_code: initial?.postal_code || "",
    city: initial?.city || "",
    country: initial?.country || "NL",
    default_account_code: initial?.default_account_code || "",
    default_vat_rate: initial?.default_vat_rate ?? 21,
    notes: initial?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function onSave() {
    if (!form.name.trim()) {
      setErr("Naam is verplicht");
      return;
    }
    setErr("");
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [
          k,
          typeof v === "string" && v.trim() === "" ? null : v,
        ]),
      );
      payload.name = form.name.trim();
      const r = isEdit
        ? await fetch(`/api/suppliers/${initial!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/suppliers", {
            method: "POST",
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
      setSaving(false);
    }
  }

  return (
    <section className="bg-[var(--surface)] border border-emerald-500/30 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">
          {isEdit ? "Leverancier bewerken" : "Nieuwe leverancier"}
        </h2>
        <button
          onClick={onCancel}
          className="p-1 text-zinc-500 hover:text-zinc-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Naam" required>
          <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        </Field>
        <Field label="Statutaire naam">
          <Input value={form.legal_name || ""} onChange={(v) => setForm({ ...form, legal_name: v })} />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={form.email || ""} onChange={(v) => setForm({ ...form, email: v })} />
        </Field>
        <Field label="Telefoon">
          <Input value={form.phone || ""} onChange={(v) => setForm({ ...form, phone: v })} />
        </Field>
        <Field label="KvK">
          <Input value={form.kvk || ""} onChange={(v) => setForm({ ...form, kvk: v })} />
        </Field>
        <Field label="BTW-nummer">
          <Input value={form.vat_number || ""} onChange={(v) => setForm({ ...form, vat_number: v })} />
        </Field>
        <Field label="IBAN">
          <Input value={form.iban || ""} onChange={(v) => setForm({ ...form, iban: v })} />
        </Field>
        <Field label="Land (ISO-2)">
          <Input value={form.country || ""} onChange={(v) => setForm({ ...form, country: v.toUpperCase().slice(0, 2) })} />
        </Field>
        <Field label="Adres">
          <Input value={form.address_line1 || ""} onChange={(v) => setForm({ ...form, address_line1: v })} />
        </Field>
        <Field label="Plaats / postcode">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Postcode"
              value={form.postal_code || ""}
              onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              className="w-24 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
            />
            <input
              type="text"
              placeholder="Plaats"
              value={form.city || ""}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
            />
          </div>
        </Field>
        <Field label="Standaard grootboekrekening (4-cijfer)">
          <Input
            value={form.default_account_code || ""}
            onChange={(v) => setForm({ ...form, default_account_code: v })}
          />
        </Field>
        <Field label="Standaard BTW-tarief">
          <select
            value={form.default_vat_rate ?? 21}
            onChange={(e) =>
              setForm({ ...form, default_vat_rate: parseInt(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            <option value="21">21%</option>
            <option value="9">9%</option>
            <option value="0">0%</option>
          </select>
        </Field>
      </div>
      <Field label="Notities">
        <textarea
          value={form.notes || ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
        />
      </Field>
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm"
        >
          Annuleren
        </button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
    </section>
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

function Input({
  value,
  onChange,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type || "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
    />
  );
}
