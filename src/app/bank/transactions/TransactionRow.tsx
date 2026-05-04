"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Search } from "lucide-react";
import type {
  BankTransaction,
  BankTxStatus,
} from "@/lib/bank/transactions";
import { formatEUR } from "@/lib/format";

interface Suggestion {
  target_type: "invoice" | "purchase";
  target_id: string;
  target_number: string;
  target_party: string;
  target_amount_cents: number;
  target_due_date: string | null;
  confidence: "auto_high" | "suggested";
  reason: string;
}

export default function TransactionRow({
  tx,
  accountName,
  status,
}: {
  tx: BankTransaction;
  accountName: string;
  status: BankTxStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  async function loadSuggestions() {
    if (suggestions) {
      setExpanded(!expanded);
      return;
    }
    setExpanded(true);
    try {
      const r = await fetch(
        `/api/bank/transactions/${tx.id}/match`,
      );
      const d = await r.json();
      setSuggestions(d.suggestions || []);
    } catch {
      setErr("Kon suggesties niet laden");
    }
  }

  async function applyMatch(s: Suggestion) {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(
        `/api/bank/transactions/${tx.id}/match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_type: s.target_type,
            target_id: s.target_id,
            confidence: "manual",
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Match mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function ignore() {
    if (!confirm("Transactie negeren? Komt niet meer terug in matching.")) return;
    setBusy(true);
    try {
      await fetch(`/api/bank/transactions/${tx.id}/ignore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "user_ignored" }),
      });
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function unignore() {
    setBusy(true);
    try {
      await fetch(`/api/bank/transactions/${tx.id}/ignore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undo: true }),
      });
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  const incoming = tx.amount_cents > 0;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="text-xs text-zinc-500 font-mono w-20 flex-shrink-0">
          {tx.date.slice(5).replace("-", "/")}
        </div>
        <span
          className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded flex-shrink-0 max-w-[140px] truncate"
          title={accountName}
        >
          {accountName}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 truncate">
            {tx.counterparty_name || "(onbekend)"}
          </p>
          <p className="text-xs text-zinc-500 truncate">
            {tx.description || tx.counterparty_iban || "—"}
          </p>
        </div>
        <div
          className={`text-sm font-mono font-semibold ${
            incoming ? "text-emerald-300" : "text-zinc-300"
          }`}
        >
          {incoming ? "+" : "-"}
          {formatEUR(Math.abs(tx.amount_cents))}
        </div>
        {status === "unmatched" && (
          <div className="flex items-center gap-1">
            <button
              onClick={loadSuggestions}
              disabled={busy}
              className="px-2 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-40 inline-flex items-center gap-1"
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
              Match
            </button>
            <button
              onClick={ignore}
              disabled={busy}
              className="px-2 py-1.5 text-xs text-zinc-500 hover:text-red-300"
              title="Negeer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {status === "ignored" && (
          <button
            onClick={unignore}
            disabled={busy}
            className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-200"
          >
            Herstel
          </button>
        )}
        {status === "matched" && (
          <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-3 ml-23 space-y-2">
          {suggestions === null ? (
            <p className="text-xs text-zinc-500">Zoeken...</p>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Geen automatische matches gevonden — boek handmatig via
              een journaalpost (
              <a
                href="/journal/new"
                className="underline hover:text-zinc-300"
              >
                handmatige boeking
              </a>
              ).
            </p>
          ) : (
            suggestions.map((s) => (
              <div
                key={`${s.target_type}-${s.target_id}`}
                className={`flex items-center justify-between px-3 py-2 rounded border ${
                  s.confidence === "auto_high"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-[var(--border)] bg-zinc-900/40"
                }`}
              >
                <div className="text-xs">
                  <p className="text-zinc-200 font-mono">
                    {s.target_number}{" "}
                    <span className="text-zinc-500 font-sans">
                      · {s.target_party}
                    </span>
                  </p>
                  <p className="text-zinc-500 mt-0.5">{s.reason}</p>
                </div>
                <button
                  onClick={() => applyMatch(s)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-40"
                >
                  Koppel
                </button>
              </div>
            ))
          )}
          {err && <p className="text-xs text-red-300">{err}</p>}
        </div>
      )}
    </div>
  );
}
