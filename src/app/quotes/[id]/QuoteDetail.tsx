"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Download,
  FileText,
  Send,
  MailCheck,
  X,
  ArrowRightCircle,
  Link2,
  Check,
  Eye,
  MousePointerClick,
  Bell,
} from "lucide-react";
import type { QuoteWithLines } from "@/lib/quotes";
import { formatEUR, formatDate } from "@/lib/format";
import EmailStats from "@/app/shared/EmailStats";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
  sent: { text: "Verzonden", cls: "bg-indigo-500/15 text-indigo-300" },
  accepted: { text: "Geaccepteerd", cls: "bg-emerald-500/15 text-emerald-300" },
  rejected: { text: "Afgewezen", cls: "bg-red-500/15 text-red-300" },
  expired: { text: "Verlopen", cls: "bg-amber-500/15 text-amber-300" },
  converted: { text: "Omgezet naar factuur", cls: "bg-zinc-800 text-zinc-400" },
};

export default function QuoteDetail({
  quote,
  clientEmail,
}: {
  quote: QuoteWithLines;
  clientEmail: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const emailed = !!quote.emailed_at;
  const hasSnapshot = !!(
    quote.company_snapshot_json && quote.client_snapshot_json
  );

  async function action(type: "accept" | "reject") {
    const prompt =
      type === "accept"
        ? "Markeer offerte als geaccepteerd?"
        : "Markeer offerte als afgewezen?";
    if (!confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quote.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Actie mislukt");
        return;
      }
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onConvert() {
    if (
      !confirm(
        "Offerte omzetten naar concept-factuur? De offerte blijft behouden; factuur start als concept die je nog kunt bewerken.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quote.id}/convert`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Converteren mislukt");
        return;
      }
      router.push(`/invoices/${data.invoice.id}`);
    } catch {
      setError("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/quotes"
            className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Alle offertes
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
            {quote.number}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${
                STATUS_LABEL[quote.status]?.cls || "bg-zinc-800"
              }`}
            >
              {STATUS_LABEL[quote.status]?.text || quote.status}
            </span>
            <span className="text-xs text-zinc-500">
              {formatDate(quote.issue_date)} · geldig tot{" "}
              {formatDate(quote.valid_until_date)}
            </span>
            {quote.converted_invoice_id && (
              <Link
                href={`/invoices/${quote.converted_invoice_id}`}
                className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
              >
                <ArrowRightCircle className="w-3 h-3" />
                Bekijk factuur
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/quotes/${quote.id}/pdf?download=1&v=${quote.updated_at}`}
            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            PDF downloaden
          </a>
          {quote.status === "sent" && (
            <>
              <button
                onClick={() => setSendOpen(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                {emailed ? (
                  <>
                    <MailCheck className="w-4 h-4" />
                    Opnieuw versturen
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Versturen
                  </>
                )}
              </button>
              <button
                onClick={() => action("accept")}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" />
                Accepteren
              </button>
              <button
                onClick={() => action("reject")}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                <XCircle className="w-4 h-4" />
                Afwijzen
              </button>
            </>
          )}
          {quote.status === "accepted" && !quote.converted_invoice_id && (
            <button
              onClick={onConvert}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
            >
              <ArrowRightCircle className="w-4 h-4" />
              Maak factuur
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {hasSnapshot && (
        <div className="text-[11px] text-zinc-500 inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Bedrijfs- en klantgegevens bevroren op moment van finaliseren.
        </div>
      )}

      {quote.public_token ? (
        <PublicLinkBanner token={quote.public_token} />
      ) : quote.status === "sent" ? (
        <GenerateTokenBanner quoteId={quote.id} />
      ) : null}

      {(emailed || quote.open_count > 0) && (
        <div className="flex items-center gap-4 text-xs text-zinc-400 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            {quote.open_count > 0 ? (
              <>
                <span className="font-semibold text-zinc-200">
                  {quote.open_count}×
                </span>{" "}
                geopend
                {quote.last_opened_at && (
                  <span className="text-zinc-500">
                    {" "}
                    · laatst{" "}
                    {new Date(quote.last_opened_at).toLocaleString("nl-NL")}
                  </span>
                )}
              </>
            ) : (
              <span className="text-amber-400">Nog niet geopend</span>
            )}
          </span>
          {quote.link_click_count > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5" />
              <span className="font-semibold text-zinc-200">
                {quote.link_click_count}×
              </span>{" "}
              klik op link
            </span>
          )}
          {quote.reminder_sent_at && (
            <span className="inline-flex items-center gap-1.5 text-indigo-300">
              <Bell className="w-3.5 h-3.5" />
              Herinnering verstuurd{" "}
              {new Date(quote.reminder_sent_at).toLocaleDateString("nl-NL")}
            </span>
          )}
          {quote.expiry_warning_sent_at && (
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <Bell className="w-3.5 h-3.5" />
              Verloop-waarschuwing verstuurd
            </span>
          )}
        </div>
      )}

      {(quote.accepted_by_name || quote.rejected_by_name) && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            {quote.accepted_by_name ? "Akkoord gegeven" : "Afgewezen"}
          </h3>
          <div className="mt-2 text-sm text-zinc-300">
            door{" "}
            <span className="font-semibold text-zinc-100">
              {quote.accepted_by_name || quote.rejected_by_name}
            </span>
            {quote.accepted_at && (
              <span className="text-zinc-500">
                {" "}
                · {new Date(quote.accepted_at).toLocaleString("nl-NL")}
              </span>
            )}
            {quote.rejected_at && (
              <span className="text-zinc-500">
                {" "}
                · {new Date(quote.rejected_at).toLocaleString("nl-NL")}
              </span>
            )}
          </div>
          {quote.rejected_reason && (
            <p className="text-xs text-zinc-400 mt-2">
              Reden: {quote.rejected_reason}
            </p>
          )}
        </div>
      )}

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-zinc-300 inline-flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-500" />
            PDF preview
          </h2>
          {emailed && quote.postmark_message_id && (
            <EmailStats messageId={quote.postmark_message_id} />
          )}
        </div>
        <iframe
          src={`/api/quotes/${quote.id}/pdf?v=${quote.updated_at}`}
          className="w-full h-[85vh] bg-zinc-100"
          title={`Offerte ${quote.number}`}
        />
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-sm text-zinc-400">
        <p className="text-xs text-zinc-500 mb-2">Totaal</p>
        <p className="text-2xl font-bold text-zinc-100 font-mono">
          {formatEUR(quote.total_cents)}
        </p>
      </section>

      {sendOpen && (
        <SendDialog
          quoteId={quote.id}
          defaultTo={clientEmail || ""}
          onClose={() => setSendOpen(false)}
          onSent={() => {
            setSendOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function GenerateTokenBanner({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/quotes/${quoteId}/public-token`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      <Link2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-300">
          Deze offerte heeft nog geen publieke accept-link (gefinaliseerd
          vóór de feature bestond).
        </p>
        {err && <p className="text-[11px] text-red-400 mt-1">{err}</p>}
      </div>
      <button
        onClick={generate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-amber-600 hover:bg-amber-500 rounded-md transition-colors disabled:opacity-40"
      >
        {busy ? "Bezig..." : "Link genereren"}
      </button>
    </div>
  );
}

function PublicLinkBanner({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const base =
    (typeof window !== "undefined" &&
      (process.env.NEXT_PUBLIC_ACCOUNTING_URL ||
        window.location.origin)) ||
    "";
  const url = `${base}/quote-accept/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      <Link2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-400">
          Publieke accept-link (wordt automatisch meegestuurd in de verzend-mail)
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block font-mono text-xs text-indigo-300 hover:text-indigo-200 truncate"
        >
          {url}
        </a>
      </div>
      <button
        onClick={copy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-emerald-400" />
            Gekopieerd
          </>
        ) : (
          <>
            <Link2 className="w-3 h-3" />
            Kopieer link
          </>
        )}
      </button>
    </div>
  );
}

function SendDialog({
  quoteId,
  defaultTo,
  onClose,
  onSent,
}: {
  quoteId: string;
  defaultTo: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  async function onSend() {
    setErr("");
    if (!to.trim()) {
      setErr("Vul een ontvanger in");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), cc: cc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Versturen mislukt");
        return;
      }
      onSent();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            Offerte per e-mail versturen
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">Aan</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">Cc</span>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
        </div>
        {err && (
          <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-2">
            {err}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Annuleren
          </button>
          <button
            onClick={onSend}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
          >
            <Send className="w-4 h-4" />
            {sending ? "Versturen..." : "Verstuur"}
          </button>
        </div>
      </div>
    </div>
  );
}
