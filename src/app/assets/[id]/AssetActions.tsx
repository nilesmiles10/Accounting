"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle, RefreshCw, Trash2 } from "lucide-react";
import type { AssetWithStats } from "@/lib/assets";

export default function AssetActions({ asset }: { asset: AssetWithStats }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showDispose, setShowDispose] = useState(false);

  async function runCatchup() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(
        `/api/assets/${asset.id}/depreciate`,
        { method: "POST" },
      );
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Catch-up mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (
      !confirm(
        `Activum "${asset.name}" verwijderen? Kan alleen als er nog geen afschrijvingen zijn geboekt.`,
      )
    )
      return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/assets/${asset.id}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Verwijderen mislukt");
        return;
      }
      router.push("/assets");
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onDispose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData(e.currentTarget);
      const proceeds = Number(
        String(fd.get("proceeds") || "0").replace(",", "."),
      );
      const r = await fetch(
        `/api/assets/${asset.id}/dispose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            disposal_date: String(fd.get("date") || ""),
            disposal_amount_cents: Math.round((proceeds || 0) * 100),
            bank_account_code: String(fd.get("bank") || "1100"),
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Afstoting mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  if (asset.status === "disposed") {
    return (
      <div className="bg-zinc-900/40 border border-[var(--border)] rounded-xl p-4 text-sm text-zinc-400">
        Activum is afgestoten op{" "}
        {new Date(asset.disposed_date!).toLocaleDateString("nl-NL")} —
        opbrengst{" "}
        {(asset.disposal_amount_cents || 0) / 100} EUR. Geen acties
        beschikbaar.
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={runCatchup}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg disabled:opacity-40"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Afschrijvingen bijwerken
        </button>
        {asset.status === "active" && (
          <button
            onClick={() => setShowDispose((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs rounded-lg"
          >
            <XCircle className="w-3.5 h-3.5" />
            Afstoten / verkopen
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:bg-red-500/10 text-xs rounded-lg disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Verwijder
        </button>
      </div>

      {showDispose && asset.status === "active" && (
        <form
          onSubmit={onDispose}
          className="border-t border-[var(--border)] pt-3 space-y-3"
        >
          <p className="text-xs text-zinc-400">
            Afstoten boekt resterende boekwaarde van{" "}
            <span className="font-mono text-zinc-200">
              {(asset.book_value_cents / 100).toLocaleString("nl-NL", {
                style: "currency",
                currency: "EUR",
              })}
            </span>{" "}
            af. Verschil tussen boekwaarde en opbrengst → 9000 (winst/
            verlies).
          </p>
          <div className="grid grid-cols-3 gap-2">
            <input
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200"
            />
            <input
              name="proceeds"
              type="text"
              inputMode="decimal"
              placeholder="Opbrengst € (0 = sloop)"
              defaultValue="0"
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 font-mono"
            />
            <select
              name="bank"
              defaultValue="1100"
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200"
            >
              <option value="1100">1100 Rabobank</option>
              <option value="1110">1110 PayPal</option>
              <option value="1120">1120 Revolut</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg disabled:opacity-40"
            >
              {busy ? "Boeken..." : "Afstoten boeken"}
            </button>
            <button
              type="button"
              onClick={() => setShowDispose(false)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Annuleer
            </button>
          </div>
        </form>
      )}

      {err && (
        <p className="text-xs text-red-300">{err}</p>
      )}
    </div>
  );
}
