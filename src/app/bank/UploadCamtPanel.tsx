"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, ChevronRight, AlertTriangle } from "lucide-react";
import type { BankAccount } from "@/lib/bank/accounts";

export default function UploadCamtPanel({
  accounts,
}: {
  accounts: BankAccount[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showWarnings, setShowWarnings] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    auto_matched: number;
    warnings: string[];
    bank_account_id?: string;
  } | null>(null);

  // Upload werkt op elke rekening waar geen automatische API-sync is
  // (camt_upload, manual). Ook PayPal-accounts kunnen historisch CSV
  // krijgen — dus we laten alle accounts zien.
  const uploadable = accounts.filter((a) => a.active === 1);
  if (uploadable.length === 0) return null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setResult(null);
    setShowWarnings(false);
    const form = e.currentTarget;
    try {
      const fd = new FormData(form);
      const bankAccountId = String(fd.get("bank_account_id") || "");
      const r = await fetch("/api/bank/upload", {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Upload mislukt");
        return;
      }
      setResult({ ...d, bank_account_id: bankAccountId });
      router.refresh();
      form.reset();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3"
    >
      <div>
        <p className="text-sm font-semibold text-zinc-200 inline-flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Bankafschrift uploaden
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          XML (CAMT.053) of CSV uit Rabobank / ING Bankieren. Format
          wordt automatisch herkend. Transacties worden ge-import en
          waar mogelijk automatisch gematched.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Rekening</span>
          <select
            name="bank_account_id"
            required
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            {uploadable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            XML of CSV
          </span>
          <input
            name="file"
            type="file"
            accept=".xml,.csv,application/xml,text/xml,text/csv,text/plain"
            required
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-zinc-800 file:text-zinc-200"
          />
        </label>
      </div>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
          {err}
        </div>
      )}

      {result && (
        <div
          className={`border rounded-lg p-3 space-y-2 text-sm ${
            result.inserted > 0
              ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-200"
              : "bg-amber-500/5 border-amber-500/30 text-amber-200"
          }`}
        >
          <p>
            {result.inserted > 0 ? "✓ " : "⚠ "}
            {result.inserted} nieuwe transactie
            {result.inserted !== 1 ? "s" : ""} geïmporteerd
            {result.skipped > 0 && `, ${result.skipped} overgeslagen (al bekend)`}
          </p>
          {result.auto_matched > 0 && (
            <p>
              ✓ {result.auto_matched} automatisch gematched aan facturen
            </p>
          )}
          {result.inserted > 0 && (
            <Link
              href={`/bank/transactions?account=${result.bank_account_id}&status=unmatched`}
              className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 underline"
            >
              Bekijk transacties
              <ChevronRight className="w-3 h-3" />
            </Link>
          )}
          {result.warnings.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowWarnings((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 underline"
              >
                <AlertTriangle className="w-3 h-3" />
                {result.warnings.length} waarschuwing
                {result.warnings.length !== 1 ? "en" : ""}{" "}
                {showWarnings ? "verbergen" : "tonen"}
              </button>
              {showWarnings && (
                <ul className="mt-2 list-disc list-inside text-xs text-amber-200/80 max-h-48 overflow-y-auto space-y-0.5">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
      >
        {busy ? "Verwerken..." : "Upload & importeer"}
      </button>
    </form>
  );
}
