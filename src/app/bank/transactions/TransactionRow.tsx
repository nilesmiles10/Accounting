"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type {
  BankTransaction,
  BankTxStatus,
} from "@/lib/bank/transactions";
import type { Account } from "@/lib/ledger/accounts";
import { formatEUR } from "@/lib/format";

interface PurchaseHit {
  id: string;
  supplier_invoice_number: string | null;
  supplier_name: string | null;
  issue_date: string;
  total_cents: number;
  due_date: string | null;
}

export default function TransactionRow({
  tx,
  accountName,
  status,
  bookableAccounts,
}: {
  tx: BankTransaction;
  accountName: string;
  status: BankTxStatus;
  bookableAccounts: Account[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"invoice" | "account">("invoice");

  // Tab 1: zoek inkoopfacturen
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PurchaseHit[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tab 2: direct boeken
  const [accountCode, setAccountCode] = useState("");
  const [bookDescription, setBookDescription] = useState("");
  const [vatCode, setVatCode] = useState<string>("");

  const incoming = tx.amount_cents > 0;

  function toggle() {
    setExpanded((v) => !v);
    setErr("");
    if (!expanded && hits === null) {
      // Eerste open: laad direct top suggesties op exact bedrag
      void searchPurchases("");
    }
  }

  async function searchPurchases(q: string) {
    try {
      const params = new URLSearchParams({
        q,
        amount_cents: String(Math.abs(tx.amount_cents)),
      });
      const r = await fetch(`/api/purchase/search?${params}`);
      const d = await r.json();
      setHits(d.results || []);
    } catch {
      setErr("Zoeken mislukt");
    }
  }

  // Debounced search
  useEffect(() => {
    if (!expanded || tab !== "invoice") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void searchPurchases(query);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, expanded, tab]);

  async function linkPurchase(hit: PurchaseHit) {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/bank/transactions/${tx.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: "purchase",
          target_id: hit.id,
          confidence: "manual",
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Koppelen mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  // Suggereer BTW-code o.b.v. default_vat_rate van gekozen rekening,
  // maar respecteer eigen keuze als user al iets handmatig heeft gezet.
  const [vatTouched, setVatTouched] = useState(false);
  useEffect(() => {
    if (vatTouched) return;
    if (!accountCode) {
      setVatCode("");
      return;
    }
    const acct = bookableAccounts.find((a) => a.code === accountCode);
    if (!acct) return;
    const rate = acct.default_vat_rate;
    if (rate === 21) setVatCode("21");
    else if (rate === 9) setVatCode("9");
    else if (rate === 0) setVatCode("0");
    else setVatCode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCode]);

  async function bookOnAccount() {
    if (!accountCode) {
      setErr("Kies eerst een grootboekrekening");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(
        `/api/bank/transactions/${tx.id}/book-direct`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_code: accountCode,
            description: bookDescription || undefined,
            vat_code: vatCode || null,
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Boeking mislukt");
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
    if (!confirm("Transactie negeren? Komt niet meer terug in matching."))
      return;
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

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        {status === "unmatched" ? (
          <button
            onClick={toggle}
            className="text-zinc-500 hover:text-zinc-200 flex-shrink-0"
            title={expanded ? "Inklappen" : "Uitklappen"}
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div className="text-xs text-zinc-500 font-mono w-20 flex-shrink-0">
          {tx.date.slice(5).replace("-", "/")}
        </div>
        <span
          className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded flex-shrink-0 max-w-[140px] truncate"
          title={accountName}
        >
          {accountName}
        </span>
        <button
          onClick={status === "unmatched" ? toggle : undefined}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm text-zinc-200 truncate">
            {tx.counterparty_name || "(onbekend)"}
          </p>
          <p className="text-xs text-zinc-500 truncate">
            {tx.description || tx.counterparty_iban || "—"}
          </p>
        </button>
        <div
          className={`text-sm font-mono font-semibold ${
            incoming ? "text-emerald-300" : "text-zinc-300"
          }`}
        >
          {incoming ? "+" : "-"}
          {formatEUR(Math.abs(tx.amount_cents))}
        </div>
        {status === "unmatched" && (
          <button
            onClick={ignore}
            disabled={busy}
            className="px-2 py-1.5 text-xs text-zinc-500 hover:text-red-300"
            title="Negeer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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

      {expanded && status === "unmatched" && (
        <div className="mt-3 ml-7 bg-zinc-900/40 border border-[var(--border)] rounded-lg p-3 space-y-3">
          {/* Tab switcher */}
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setTab("invoice")}
              className={`px-3 py-1.5 rounded ${
                tab === "invoice"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Inkoopfactuur zoeken
            </button>
            <button
              onClick={() => setTab("account")}
              className={`px-3 py-1.5 rounded ${
                tab === "account"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Boek op grootboek
            </button>
          </div>

          {tab === "invoice" && (
            <div className="space-y-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op factuurnummer of leveranciernaam..."
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
                autoFocus
              />
              {hits === null ? (
                <p className="text-xs text-zinc-500">Zoeken…</p>
              ) : hits.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Geen openstaande inkoopfacturen gevonden
                  {query ? " voor deze zoekterm" : " met dit bedrag"}.
                </p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {hits.map((h) => {
                    const exact =
                      h.total_cents === Math.abs(tx.amount_cents);
                    return (
                      <div
                        key={h.id}
                        className={`flex items-center justify-between px-3 py-2 rounded border ${
                          exact
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <div className="text-xs flex-1 min-w-0">
                          <p className="text-zinc-200 font-mono truncate">
                            {h.supplier_invoice_number || "—"}{" "}
                            <span className="text-zinc-500 font-sans">
                              · {h.supplier_name || "?"}
                            </span>
                          </p>
                          <p className="text-zinc-500 mt-0.5">
                            {h.issue_date} · {formatEUR(h.total_cents)}
                            {exact && (
                              <span className="text-emerald-400 ml-2">
                                ✓ exact
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => linkPurchase(h)}
                          disabled={busy}
                          className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-40"
                        >
                          Koppel
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "account" && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">
                Boekt direct op de gekozen rekening — geen factuur nodig.
                Voor bankkosten, privé-opnames, BTW-afdracht, overboekingen.
              </p>
              <div className="grid grid-cols-12 gap-2">
                <select
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                  className="col-span-7 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
                >
                  <option value="">— kies grootboekrekening —</option>
                  {groupAccounts(bookableAccounts).map((g) => (
                    <optgroup key={g.type} label={g.label}>
                      {g.items.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  value={vatCode}
                  onChange={(e) => {
                    setVatTouched(true);
                    setVatCode(e.target.value);
                  }}
                  title="BTW-code op deze regel"
                  className="col-span-2 px-2 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
                >
                  <option value="">— BTW —</option>
                  <option value="0">0% / geen</option>
                  <option value="9">9%</option>
                  <option value="21">21%</option>
                  <option value="0EU">0% EU verlegd</option>
                  <option value="0EX">0% export</option>
                </select>
                <input
                  type="text"
                  value={bookDescription}
                  onChange={(e) => setBookDescription(e.target.value)}
                  placeholder="Omschrijving"
                  className="col-span-3 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
                />
              </div>
              <p className="text-[11px] text-zinc-600">
                Wordt geboekt:{" "}
                {incoming
                  ? `Debet ${tx.bank_account_id ? "bank" : "?"} / Credit ${accountCode || "..."}`
                  : `Debet ${accountCode || "..."} / Credit bank`}{" "}
                · {formatEUR(Math.abs(tx.amount_cents))}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={bookOnAccount}
                  disabled={busy || !accountCode}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                  Boek direct
                </button>
              </div>
            </div>
          )}

          {err && <p className="text-xs text-red-300">{err}</p>}
        </div>
      )}
    </div>
  );
}

function groupAccounts(accounts: Account[]) {
  const TYPE_LABEL: Record<string, string> = {
    expense: "Kosten",
    income: "Omzet",
    asset: "Activa",
    liability: "Passiva",
    equity: "Eigen vermogen",
  };
  const TYPE_ORDER = ["expense", "income", "asset", "liability", "equity"];
  return TYPE_ORDER.map((t) => ({
    type: t,
    label: TYPE_LABEL[t] || t,
    items: accounts.filter((a) => a.type === t),
  })).filter((g) => g.items.length > 0);
}
