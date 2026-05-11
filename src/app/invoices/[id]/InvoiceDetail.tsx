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
  Copy,
  CreditCard,
  Link2,
  Check,
  BellOff,
  BellRing,
} from "lucide-react";
import type { InvoiceWithLines } from "@/lib/invoices";
import { formatEUR, formatQty, formatDate } from "@/lib/format";
import EmailStats from "@/app/shared/EmailStats";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
  sent: { text: "Verstuurd", cls: "bg-indigo-500/15 text-indigo-300" },
  paid: { text: "Betaald", cls: "bg-emerald-500/15 text-emerald-300" },
  overdue: { text: "Te laat", cls: "bg-red-500/15 text-red-300" },
  cancelled: { text: "Geannuleerd", cls: "bg-zinc-800 text-zinc-500" },
};

export default function InvoiceDetail({
  invoice,
  clientEmail,
}: {
  invoice: InvoiceWithLines;
  clientEmail: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const emailed = !!(invoice as InvoiceWithLines & { emailed_at?: number | null }).emailed_at;
  const hasSnapshot = !!(
    invoice.company_snapshot_json && invoice.client_snapshot_json
  );

  async function onDuplicate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/invoices/${invoice.id}/duplicate`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Dupliceren mislukt");
        return;
      }
      router.push(`/invoices/${data.invoice.id}`);
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onCreditNote() {
    if (
      !confirm(
        "Creditnota maken voor deze factuur? Er wordt een concept gemaakt met dezelfde regels — finaliseer pas als de bedragen kloppen voor wat je wilt crediteren.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/invoices/${invoice.id}/credit-note`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Creditnota maken mislukt");
        return;
      }
      router.push(`/invoices/${data.invoice.id}`);
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function togglePauseReminders() {
    const newState = invoice.reminders_paused !== 1;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/invoices/${invoice.id}/reminders-pause`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused: newState }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bijwerken mislukt");
        return;
      }
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function action(type: "paid" | "cancel") {
    const prompt =
      type === "paid"
        ? "Factuur op 'betaald' zetten?"
        : "Factuur annuleren? Dit kan niet worden teruggedraaid.";
    if (!confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/status`, {
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

  // VAT breakdown based on stored lines
  const byRate = new Map<number, { rate: number; base: number; vat: number }>();
  for (const l of invoice.lines) {
    const rate =
      invoice.vat_treatment === "standard" ? l.vat_rate : 0;
    const entry = byRate.get(rate) ?? { rate, base: 0, vat: 0 };
    entry.base += l.line_total_cents;
    entry.vat +=
      invoice.vat_treatment === "standard" ? l.line_vat_cents : 0;
    byRate.set(rate, entry);
  }
  const breakdown = Array.from(byRate.values()).sort((a, b) => a.rate - b.rate);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/invoices"
            className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Alle facturen
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1 font-mono">
            {invoice.number}
          </h1>
          {invoice.is_credit_note === 1 && (
            <p className="text-xs text-amber-300 mt-1">
              Creditnota
              {invoice.credits_invoice_id
                ? " — verwijst naar originele factuur"
                : ""}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${
                STATUS_LABEL[invoice.status]?.cls || "bg-zinc-800"
              }`}
            >
              {STATUS_LABEL[invoice.status]?.text || invoice.status}
            </span>
            <span className="text-xs text-zinc-500">
              {formatDate(invoice.issue_date)} · vervalt{" "}
              {formatDate(invoice.due_date)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/invoices/${invoice.id}/pdf?download=1&v=${invoice.updated_at}`}
            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            PDF downloaden
          </a>
          <button
            onClick={onDuplicate}
            disabled={busy}
            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
            title="Maak concept met zelfde regels en klant"
          >
            <Copy className="w-4 h-4" />
            Dupliceer
          </button>
          {invoice.status !== "draft" &&
            invoice.is_credit_note !== 1 &&
            !invoice.cancelled_at && (
              <button
                onClick={onCreditNote}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                title="Maak creditnota voor deze factuur"
              >
                <Copy className="w-4 h-4" />
                Creditnota
              </button>
            )}
          {invoice.status === "sent" || invoice.status === "overdue" ? (
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
                    Verstuur per e-mail
                  </>
                )}
              </button>
              <button
                onClick={togglePauseReminders}
                disabled={busy}
                className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 ${
                  invoice.reminders_paused === 1
                    ? "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
                title={
                  invoice.reminders_paused === 1
                    ? "Auto-herinneringen staan uit voor deze factuur"
                    : "Auto-herinneringen pauzeren"
                }
              >
                {invoice.reminders_paused === 1 ? (
                  <>
                    <BellOff className="w-4 h-4" />
                    Herinneringen uit
                  </>
                ) : (
                  <>
                    <BellRing className="w-4 h-4" />
                    Herinneringen aan
                  </>
                )}
              </button>
              <button
                onClick={() => action("paid")}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" />
                Op betaald zetten
              </button>
              <button
                onClick={() => action("cancel")}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                <XCircle className="w-4 h-4" />
                Annuleren
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {invoice.status !== "paid" && invoice.status !== "cancelled" && (
        <MollieBanner invoice={invoice} />
      )}

      {hasSnapshot ? (
        <div className="text-[11px] text-zinc-500 inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Bedrijfs- en klantgegevens zijn bevroren op moment van finaliseren
          ({invoice.sent_at ? formatDate(
            new Date(invoice.sent_at).toISOString().slice(0, 10),
          ) : "—"}). Latere wijzigingen aan bedrijf of klant veranderen deze factuur niet.
        </div>
      ) : (
        <div className="bg-amber-500/5 border border-amber-500/20 text-amber-200 text-[11px] rounded-lg p-2.5">
          Deze factuur is gefinaliseerd vóór de snapshot-feature bestond en
          gebruikt nog live bedrijfsgegevens. Nieuwe facturen worden
          automatisch bevroren bij finaliseren.
        </div>
      )}

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Van</p>
            <p className="mt-1 font-semibold text-zinc-100">
              {(invoice as InvoiceWithLines & { company_name?: string }).company_name ??
                invoice.company_id}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Aan</p>
            <p className="mt-1 font-semibold text-zinc-100">
              {(invoice as InvoiceWithLines & { client_name?: string }).client_name ??
                invoice.client_id}
            </p>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500 uppercase tracking-wider border-b border-[var(--border)]">
            <tr>
              <th className="text-left py-2 font-medium">Omschrijving</th>
              <th className="text-right py-2 font-medium w-20">Aantal</th>
              <th className="text-left py-2 font-medium w-16 pl-2">Eenh.</th>
              <th className="text-right py-2 font-medium w-24">Stukprijs</th>
              <th className="text-right py-2 font-medium w-14">BTW</th>
              <th className="text-right py-2 font-medium w-24">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-[var(--border)]">
                <td className="py-2 text-zinc-200">{l.description}</td>
                <td className="py-2 text-right font-mono text-zinc-300">
                  {formatQty(l.quantity_milli)}
                </td>
                <td className="py-2 text-zinc-400 text-xs pl-2">{l.unit}</td>
                <td className="py-2 text-right font-mono text-zinc-300">
                  {formatEUR(l.unit_price_cents)}
                </td>
                <td className="py-2 text-right text-zinc-400 text-xs">
                  {invoice.vat_treatment === "standard" ? `${l.vat_rate}%` : "0%"}
                </td>
                <td className="py-2 text-right font-mono text-zinc-100">
                  {formatEUR(l.line_total_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-400">Subtotaal</dt>
            <dd className="font-mono text-zinc-200">
              {formatEUR(invoice.subtotal_cents)}
            </dd>
          </div>
          {breakdown.map((b) => (
            <div key={b.rate} className="flex justify-between">
              <dt className="text-zinc-400">
                BTW {b.rate}%{" "}
                <span className="text-zinc-600 text-xs">
                  over {formatEUR(b.base)}
                </span>
              </dt>
              <dd className="font-mono text-zinc-200">
                {formatEUR(b.vat)}
              </dd>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-2 border-t border-[var(--border)]">
            <dt className="font-semibold text-zinc-100">Totaal</dt>
            <dd className="font-mono font-semibold text-lg text-zinc-100">
              {formatEUR(invoice.total_cents)}
            </dd>
          </div>
        </div>

        {invoice.vat_treatment === "reverse_charge_eu" && (
          <p className="text-xs text-zinc-400 bg-zinc-900 border border-[var(--border)] rounded-lg p-3">
            BTW verlegd naar ontvanger (intracommunautaire levering).
          </p>
        )}
        {invoice.vat_treatment === "export_outside_eu" && (
          <p className="text-xs text-zinc-400 bg-zinc-900 border border-[var(--border)] rounded-lg p-3">
            Export van diensten/goederen buiten de EU — BTW 0%.
          </p>
        )}

        {invoice.notes && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
              Notities
            </p>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">
              {invoice.notes}
            </p>
          </div>
        )}
        {invoice.terms_text && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
              Betalingsvoorwaarden
            </p>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">
              {invoice.terms_text}
            </p>
          </div>
        )}
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-zinc-300 inline-flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-500" />
            PDF preview
          </h2>
          {emailed && invoice.postmark_message_id && (
            <EmailStats messageId={invoice.postmark_message_id} />
          )}
        </div>
        <iframe
          src={`/api/invoices/${invoice.id}/pdf?v=${invoice.updated_at}`}
          className="w-full h-[85vh] bg-zinc-100"
          title={`Factuur ${invoice.number}`}
        />
      </section>

      {sendOpen && (
        <SendDialog
          invoiceId={invoice.id}
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

function MollieBanner({ invoice }: { invoice: InvoiceWithLines }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/mollie`, {
        method: "POST",
      });
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

  async function copyLink() {
    if (!invoice.mollie_payment_url) return;
    try {
      await navigator.clipboard.writeText(invoice.mollie_payment_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const statusColor =
    invoice.mollie_status === "paid"
      ? "text-emerald-300"
      : invoice.mollie_status === "open" || invoice.mollie_status === "pending"
        ? "text-indigo-300"
        : invoice.mollie_status === "failed" ||
            invoice.mollie_status === "canceled" ||
            invoice.mollie_status === "expired"
          ? "text-red-300"
          : "text-zinc-400";

  if (!invoice.mollie_payment_url) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3 flex-wrap">
        <CreditCard className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        <p className="flex-1 text-xs text-zinc-400">
          Voeg een Mollie-betaallink toe zodat de klant direct kan betalen
          (iDEAL / creditcard).
        </p>
        {err && <p className="text-[11px] text-red-400">{err}</p>}
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors disabled:opacity-40"
        >
          <CreditCard className="w-3 h-3" />
          {busy ? "Bezig..." : "Betaallink genereren"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      <Link2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-400">
          Mollie betaallink —{" "}
          <span className={`font-medium ${statusColor}`}>
            {invoice.mollie_status || "open"}
          </span>
        </p>
        <a
          href={invoice.mollie_payment_url}
          target="_blank"
          rel="noreferrer"
          className="block font-mono text-xs text-indigo-300 hover:text-indigo-200 truncate"
        >
          {invoice.mollie_payment_url}
        </a>
      </div>
      <button
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-emerald-400" />
            Gekopieerd
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" />
            Kopieer
          </>
        )}
      </button>
    </div>
  );
}

function SendDialog({
  invoiceId,
  defaultTo,
  onClose,
  onSent,
}: {
  invoiceId: string;
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
      const res = await fetch(`/api/invoices/${invoiceId}/send`, {
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
            Factuur per e-mail versturen
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200"
            aria-label="Sluiten"
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
              placeholder="klant@voorbeeld.nl"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">Cc (optioneel)</span>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <p className="text-[11px] text-zinc-500">
            De factuur wordt als PDF-bijlage verstuurd. Onderwerp en body
            zijn gebaseerd op het template van het bedrijf (te bewerken bij
            Bedrijven).
          </p>
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
