"use client";

import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";

export default function MollieSettingsForm({
  initialHasKey,
  initialKeyPreview,
  initialKeyType,
  initialDescriptionTemplate,
}: {
  initialHasKey: boolean;
  initialKeyPreview: string;
  initialKeyType: "live" | "test" | "unknown";
  initialDescriptionTemplate: string;
}) {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [keyPreview, setKeyPreview] = useState(initialKeyPreview);
  const [keyType, setKeyType] = useState(initialKeyType);
  const [showKey, setShowKey] = useState(false);
  const [desc, setDesc] = useState(initialDescriptionTemplate);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function onSave() {
    setError("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        description_template: desc,
      };
      if (key.trim()) body.api_key = key.trim();
      const res = await fetch("/api/settings/mollie", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Opslaan mislukt");
        return;
      }
      setSavedAt(Date.now());
      if (key.trim()) {
        setHasKey(true);
        const k = key.trim();
        setKeyPreview(
          k.length > 8
            ? `${k.slice(0, 5)}${"•".repeat(k.length - 9)}${k.slice(-4)}`
            : "•".repeat(k.length),
        );
        setKeyType(
          k.startsWith("live_") ? "live" : k.startsWith("test_") ? "test" : "unknown",
        );
        setKey("");
      }
    } catch {
      setError("Verbindingsfout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">
          Mollie API-sleutel
        </label>
        {hasKey && !key && (
          <p className="text-xs text-zinc-400 mb-2 font-mono">
            Huidig: {keyPreview}{" "}
            <span className="text-zinc-600">({keyType})</span>
          </p>
        )}
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              hasKey ? "Nieuwe sleutel invullen om te vervangen" : "live_... of test_..."
            }
            autoComplete="off"
            className="w-full pr-10 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
          >
            {showKey ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          Live-key voor echte betalingen; test-key voor testen zonder echte
          transacties.
        </p>
      </div>

      <label className="block">
        <span className="block text-xs text-zinc-500 mb-1">
          Omschrijving-template (wat de klant op z&apos;n afschrift ziet)
        </span>
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Factuur {{number}}"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="mt-1 text-[10px] text-zinc-600 block">
          Placeholders: <code>{`{{number}}`}</code> ·{" "}
          <code>{`{{company}}`}</code>
        </span>
      </label>

      <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
        >
          <Check className="w-4 h-4" />
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
        {savedAt && <span className="text-xs text-emerald-400">Opgeslagen</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </section>
  );
}
