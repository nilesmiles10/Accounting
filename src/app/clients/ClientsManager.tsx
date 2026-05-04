"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, Check, Edit3, X, Mail, MapPin } from "lucide-react";
import type { Client, ClientUpdate } from "@/lib/clients";

type ClientListItem = Client & { invoice_count: number };

export default function ClientsManager({
  initial,
}: {
  initial: ClientListItem[];
}) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientListItem[]>(initial);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const url = search
        ? `/api/clients?q=${encodeURIComponent(search)}`
        : "/api/clients";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
      }
    }, 200);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  async function onAfterMutation() {
    const res = await fetch("/api/clients");
    if (res.ok) setClients((await res.json()).clients);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="search"
            placeholder="Zoek op naam, e-mail, plaats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe klant
        </button>
      </div>

      {adding && (
        <ClientForm
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onAfterMutation();
          }}
        />
      )}

      {clients.length === 0 && !adding && (
        <div className="text-center py-12 text-sm text-zinc-500 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          Nog geen klanten.{" "}
          <button
            onClick={() => setAdding(true)}
            className="text-emerald-400 hover:text-emerald-300"
          >
            Voeg de eerste toe.
          </button>
        </div>
      )}

      <div className="space-y-2">
        {clients.map((c) =>
          editingId === c.id ? (
            <ClientForm
              key={c.id}
              initial={c}
              onCancel={() => setEditingId(null)}
              onSaved={async () => {
                setEditingId(null);
                await onAfterMutation();
              }}
            />
          ) : (
            <ClientRow
              key={c.id}
              client={c}
              onEdit={() => {
                setEditingId(c.id);
                setAdding(false);
              }}
              onDeleted={onAfterMutation}
            />
          ),
        )}
      </div>
    </div>
  );
}

function ClientRow({
  client,
  onEdit,
  onDeleted,
}: {
  client: ClientListItem;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm(`Klant "${client.name}" verwijderen?`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verwijderen mislukt");
        setDeleting(false);
        return;
      }
      await onDeleted();
    } catch {
      setError("Verbindingsfout");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-zinc-100 truncate">
            {client.name}
          </h3>
          {client.vat_number && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              {client.vat_number}
            </span>
          )}
          {client.invoice_count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
              {client.invoice_count}{" "}
              {client.invoice_count === 1 ? "factuur" : "facturen"}
            </span>
          )}
        </div>
        {client.contact_name && (
          <p className="text-xs text-zinc-400 mt-1">{client.contact_name}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-zinc-500 mt-1.5 flex-wrap">
          {client.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="w-3 h-3" /> {client.email}
            </span>
          )}
          {(client.city || client.country) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />{" "}
              {[client.city, client.country].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          aria-label={`${client.name} bewerken`}
          title="Bewerken"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-2 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          aria-label={`${client.name} verwijderen`}
          title="Verwijderen (alleen als geen facturen)"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ClientForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Client;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<ClientUpdate & { name: string }>({
    name: initial?.name || "",
    contact_name: initial?.contact_name || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    kvk: initial?.kvk || "",
    vat_number: initial?.vat_number || "",
    address_line1: initial?.address_line1 || "",
    address_line2: initial?.address_line2 || "",
    postal_code: initial?.postal_code || "",
    city: initial?.city || "",
    country: initial?.country || "NL",
    notes: initial?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    setError("");
    if (!form.name.trim()) {
      setError("Naam is verplicht");
      return;
    }
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [
          k,
          typeof v === "string" && v.trim() === "" ? null : v,
        ]),
      );
      payload.name = form.name.trim();

      const res = isEdit
        ? await fetch(`/api/clients/${initial!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/clients", {
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
    <section className="bg-[var(--surface)] border border-emerald-500/30 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-100">
          {isEdit ? `Klant bewerken` : "Nieuwe klant"}
        </h2>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
          aria-label="Annuleren"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Naam / bedrijfsnaam" required>
          <Input value={form.name} onChange={(v) => set("name", v)} />
        </Field>
        <Field label="Contactpersoon">
          <Input
            value={form.contact_name || ""}
            onChange={(v) => set("contact_name", v)}
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={form.email || ""}
            onChange={(v) => set("email", v)}
          />
        </Field>
        <Field label="Telefoon">
          <Input value={form.phone || ""} onChange={(v) => set("phone", v)} />
        </Field>
        <Field label="KvK-nummer">
          <Input value={form.kvk || ""} onChange={(v) => set("kvk", v)} />
        </Field>
        <Field label="BTW-nummer (voor EU B2B)">
          <Input
            value={form.vat_number || ""}
            onChange={(v) => set("vat_number", v)}
          />
        </Field>
        <Field label="Adres regel 1">
          <Input
            value={form.address_line1 || ""}
            onChange={(v) => set("address_line1", v)}
          />
        </Field>
        <Field label="Adres regel 2">
          <Input
            value={form.address_line2 || ""}
            onChange={(v) => set("address_line2", v)}
          />
        </Field>
        <Field label="Postcode">
          <Input
            value={form.postal_code || ""}
            onChange={(v) => set("postal_code", v)}
          />
        </Field>
        <Field label="Plaats">
          <Input value={form.city || ""} onChange={(v) => set("city", v)} />
        </Field>
        <Field label="Land (ISO-2, bv. NL, DE, US)">
          <Input
            value={form.country || ""}
            onChange={(v) => set("country", v.toUpperCase().slice(0, 2))}
          />
        </Field>
      </div>

      <Field label="Interne notities">
        <textarea
          value={form.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          className="w-full mt-2 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </Field>

      <div className="mt-4 flex items-center gap-3">
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

function Input(props: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={props.type || "text"}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  );
}
