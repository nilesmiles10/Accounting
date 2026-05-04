"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCompanyInputs() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onAdd() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Aanmaken mislukt");
        return;
      }
      setName("");
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 flex gap-2 items-center">
      <input
        type="text"
        placeholder="Bedrijfsnaam"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
      <button
        onClick={onAdd}
        disabled={saving || !name.trim()}
        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
      >
        {saving ? "Opslaan..." : "Toevoegen"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
