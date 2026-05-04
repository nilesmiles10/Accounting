"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Send, CheckCircle2 } from "lucide-react";
import { formatEUR } from "@/lib/format";

export default function VatSubmitPanel({
  year,
  quarter,
  toPayCents,
  isClosed,
  submission,
}: {
  year: number;
  quarter: number;
  toPayCents: number;
  isClosed: boolean;
  submission: {
    submitted_at: number;
    paid_date?: string;
    to_pay_cents: number;
    payment_journal_id: string | null;
  } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData(e.currentTarget);
      const r = await fetch(`/api/vat/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          quarter,
          paid_date: String(fd.get("paid_date") || ""),
          bank_account_code: String(fd.get("bank") || "1100"),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Aangifte boeken mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    if (
      !confirm(
        `Kwartaal ${year}-Q${quarter} heropenen? Alleen doen als je nog NIET hebt ingediend bij Belastingdienst — anders moet je via suppletie.`,
      )
    )
      return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/vat/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, quarter }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Heropenen mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  if (isClosed && submission) {
    const submittedDate = new Date(submission.submitted_at);
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4" />
          Ingediend & afgesloten
        </div>
        <p className="text-xs text-zinc-400">
          Op {submittedDate.toLocaleDateString("nl-NL")} geboekt.
          Saldo: {formatEUR(Math.abs(submission.to_pay_cents))}{" "}
          {submission.to_pay_cents >= 0 ? "betaald" : "ontvangen"}.
          {submission.paid_date && (
            <> Banksaldo-datum: {submission.paid_date}.</>
          )}
        </p>
        <p className="text-xs text-zinc-500">
          Boekingen in dit kwartaal worden geweigerd. Late mutaties moeten
          via suppletie of in volgend kwartaal.
        </p>
        <button
          onClick={onReopen}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-300 mt-1"
        >
          <Unlock className="w-3.5 h-3.5" />
          Heropen kwartaal (alleen vóór indienen)
        </button>
        {err && <p className="text-xs text-red-300">{err}</p>}
      </div>
    );
  }

  if (isClosed && !submission) {
    return (
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
        Kwartaal is gesloten maar er is geen aangifte-record. Mogelijk
        handmatig gesloten via accounting_periods.
        <button
          onClick={onReopen}
          disabled={busy}
          className="block mt-2 text-xs hover:text-amber-100 underline"
        >
          Heropen kwartaal
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-200">
            Aangifte indienen & sluiten
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Boekt afdracht ({formatEUR(Math.abs(toPayCents))}{" "}
            {toPayCents >= 0 ? "naar Belastingdienst" : "retour"}) en sluit
            het kwartaal zodat late mutaties hier niet meer landen.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg whitespace-nowrap"
        >
          <Lock className="w-4 h-4" />
          Sluit kwartaal
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-zinc-200">
        BTW-aangifte {year}-Q{quarter} afronden
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Datum betaling/ontvangst
          </span>
          <input
            name="paid_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">
            Bankrekening
          </span>
          <select
            name="bank"
            defaultValue="1100"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
          >
            <option value="1100">1100 Rabobank</option>
            <option value="1110">1110 PayPal</option>
            <option value="1120">1120 Revolut</option>
            <option value="1130">1130 Creditcard</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        Hierna worden boekingen met datum in dit kwartaal geweigerd.
        Heropenen kan, maar alleen voordat je bij Belastingdienst indient.
      </p>
      {err && <p className="text-xs text-red-300">{err}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
          {busy ? "Boeken..." : "Boek & sluit"}
        </button>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Annuleer
        </button>
      </div>
    </form>
  );
}
