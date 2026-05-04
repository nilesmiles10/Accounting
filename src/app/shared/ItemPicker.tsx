"use client";

import { useState, useEffect, useRef } from "react";
import { X, Search, Package } from "lucide-react";
import type { Item } from "@/lib/items";
import { formatEUR } from "@/lib/format";

/**
 * Modal-picker voor items uit de catalog. Filter op naam, tap op item →
 * callback krijgt een regel-payload die in de editor ingevoegd kan worden.
 */
export default function ItemPicker({
  companyId,
  onPick,
  onClose,
}: {
  companyId: string;
  onPick: (line: {
    description: string;
    unit: string;
    unit_price_cents: number;
    vat_rate: number;
  }) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch(`/api/items?company_id=${companyId}&active=1`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, [companyId]);

  const filtered = query.trim()
    ? items.filter((it) =>
        (it.name + " " + (it.description || ""))
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : items;

  function choose(it: Item) {
    onPick({
      description:
        it.description && it.description.trim() ? it.description : it.name,
      unit: it.unit || "stuk",
      unit_price_cents: it.unit_price_cents,
      vat_rate: it.vat_rate,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
          <Package className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100 flex-1">
            Kies uit catalog
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-[var(--border)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Zoek op naam of omschrijving..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-8 text-center text-sm text-zinc-500">Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">
              {items.length === 0
                ? "Nog geen items voor dit bedrijf — voeg ze toe bij Instellingen → Catalog."
                : "Geen resultaten."}
            </p>
          ) : (
            <ul>
              {filtered.map((it) => (
                <li
                  key={it.id}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <button
                    onClick={() => choose(it)}
                    className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        {it.name}
                      </p>
                      {it.description && (
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {it.description}
                        </p>
                      )}
                      <div className="flex gap-2 mt-1 text-[11px] text-zinc-500">
                        <span>per {it.unit || "stuk"}</span>
                        <span>· BTW {it.vat_rate}%</span>
                      </div>
                    </div>
                    <p className="text-sm font-mono text-emerald-300 flex-shrink-0">
                      {formatEUR(it.unit_price_cents)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
