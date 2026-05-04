"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { Company } from "@/lib/companies";
import type { Account } from "@/lib/ledger/accounts";
import type { BankAccount } from "@/lib/bank/accounts";

export default function BankAccountForm({
  companies,
  ledgerAccounts,
  initial,
  onClose,
}: {
  companies: Company[];
  ledgerAccounts: Account[];
  initial?: BankAccount;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isEdit = !!initial;

  // Filter naar 1xxx assets — bank-rekeningen horen op 1100/1110/etc
  const bankCodes = ledgerAccounts.filter(
    (a) => a.type === "asset" && a.code.startsWith("1") && a.active === 1,
  );

  function close() {
    setOpen(false);
    setErr("");
    onClose?.();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData(e.currentTarget);
      if (isEdit) {
        // Edit: alleen velden die we toelaten te wijzigen via update.
        // Provider + account_code blijven vast om journal-consistentie.
        const r = await fetch(
          `/api/bank/accounts/${initial!.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              display_name: String(fd.get("display_name") || ""),
              iban: String(fd.get("iban") || "") || null,
              company_id: String(fd.get("company_id") || "") || null,
            }),
          },
        );
        const d = await r.json();
        if (!r.ok) {
          setErr(d.error || "Bijwerken mislukt");
          return;
        }
      } else {
        const r = await fetch("/api/bank/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_code: String(fd.get("account_code") || ""),
            provider: String(fd.get("provider") || "camt_upload"),
            display_name: String(fd.get("display_name") || ""),
            iban: String(fd.get("iban") || "") || null,
            company_id: String(fd.get("company_id") || "") || null,
          }),
        });
        const d = await r.json();
        if (!r.ok) {
          setErr(d.error || "Aanmaken mislukt");
          return;
        }
      }
      close();
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (
      !confirm(
        `Bankrekening "${initial.display_name}" verwijderen? Kan alleen als er nog geen transacties op staan.`,
      )
    )
      return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(
        `/api/bank/accounts/${initial.id}`,
        { method: "DELETE" },
      );
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Verwijderen mislukt");
        return;
      }
      close();
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-xl px-4 py-4 text-sm text-zinc-400 hover:border-emerald-500/40 hover:text-zinc-200 inline-flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Bankrekening koppelen
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-zinc-200">
        {isEdit ? `Bewerk: ${initial!.display_name}` : "Nieuwe bankrekening"}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">Naam</span>
          <input
            name="display_name"
            type="text"
            required
            defaultValue={initial?.display_name || ""}
            placeholder="bv. Rabobank zakelijk *7821"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Provider {isEdit && "(vast)"}
          </span>
          <select
            name="provider"
            defaultValue={initial?.provider || "camt_upload"}
            disabled={isEdit}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 disabled:opacity-60"
          >
            <option value="camt_upload">CAMT/CSV upload</option>
            <option value="paypal">PayPal API</option>
            <option value="manual">Handmatig</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Grootboekrekening {isEdit && "(vast)"}
          </span>
          <select
            name="account_code"
            required
            defaultValue={initial?.account_code || ""}
            disabled={isEdit}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 disabled:opacity-60"
          >
            <option value="">— kies —</option>
            {bankCodes.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">IBAN (optioneel)</span>
          <input
            name="iban"
            type="text"
            defaultValue={initial?.iban || ""}
            placeholder="NL00RABO0000000000"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 font-mono"
          />
        </label>
      </div>

      {companies.length > 1 && (
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Bedrijf (optioneel)
          </span>
          <select
            name="company_id"
            defaultValue={initial?.company_id || ""}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            <option value="">— gedeeld —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {err && <p className="text-xs text-red-300">{err}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
        >
          {busy ? "..." : isEdit ? "Opslaan" : "Aanmaken"}
        </button>
        <button
          type="button"
          onClick={close}
          className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Annuleer
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Verwijderen
          </button>
        )}
      </div>
    </form>
  );
}
