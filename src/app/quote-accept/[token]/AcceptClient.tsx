"use client";

import { useState } from "react";
import { Check, X, CheckCircle2, XCircle, Mail, Phone } from "lucide-react";
import { formatEUR, formatDate } from "@/lib/format";

type Lang = "nl" | "en";

interface Props {
  token: string;
  number: string;
  status: string;
  language: Lang;
  totalCents: number;
  validUntil: string;
  acceptedByName: string | null;
  rejectedByName: string | null;
  companyName: string;
  companyEmail: string | null;
  companyPhone: string | null;
  accentColor: string;
  clientName: string;
}

const COPY = {
  nl: {
    greeting: "Offerte van",
    for: "Opgesteld voor",
    totalLabel: "Offerte­bedrag",
    validLabel: "Geldig tot",
    numberLabel: "Offertenr.",
    accept: "Akkoord — start opdracht",
    reject: "Niet akkoord",
    namePlaceholder: "Je volledige naam",
    reasonPlaceholder: "Reden (optioneel)",
    acceptConfirmTitle: "Bevestig akkoord",
    acceptConfirmBody:
      "Door op bevestigen te klikken accepteer je deze offerte. Je akkoord wordt geregistreerd met je naam en tijdstip.",
    rejectTitle: "Offerte afwijzen",
    rejectBody:
      "Je mag optioneel een reden meegeven. We nemen mogelijk contact op voor een aangepast voorstel.",
    confirm: "Bevestigen",
    cancel: "Annuleren",
    downloadPdf: "Download PDF",
    acceptedTitle: "Bedankt — akkoord geregistreerd",
    acceptedBody:
      "We hebben je akkoord ontvangen. We nemen binnenkort contact op voor de vervolgstappen.",
    rejectedTitle: "Afgewezen",
    rejectedBody: "Je hebt deze offerte afgewezen. Dank voor de reactie.",
    expiredTitle: "Offerte verlopen",
    expiredBody:
      "Deze offerte is helaas verlopen. Neem contact op voor een nieuwe.",
    convertedTitle: "Al omgezet",
    convertedBody:
      "Deze offerte is al geaccepteerd en omgezet naar een factuur.",
    questions: "Vragen?",
  },
  en: {
    greeting: "Quote from",
    for: "For",
    totalLabel: "Quote amount",
    validLabel: "Valid until",
    numberLabel: "Quote no.",
    accept: "Accept — let's start",
    reject: "Decline",
    namePlaceholder: "Your full name",
    reasonPlaceholder: "Reason (optional)",
    acceptConfirmTitle: "Confirm acceptance",
    acceptConfirmBody:
      "By clicking confirm you accept this quote. Your approval is recorded with your name and timestamp.",
    rejectTitle: "Decline quote",
    rejectBody:
      "You may optionally share a reason. We might reach out with an adjusted proposal.",
    confirm: "Confirm",
    cancel: "Cancel",
    downloadPdf: "Download PDF",
    acceptedTitle: "Thanks — acceptance recorded",
    acceptedBody:
      "We've received your acceptance. We'll be in touch about next steps soon.",
    rejectedTitle: "Declined",
    rejectedBody: "You've declined this quote. Thanks for letting us know.",
    expiredTitle: "Quote expired",
    expiredBody:
      "This quote has unfortunately expired. Please reach out for a new one.",
    convertedTitle: "Already accepted",
    convertedBody:
      "This quote was already accepted and converted into an invoice.",
    questions: "Questions?",
  },
} as const;

export default function AcceptClient(props: Props) {
  const L = COPY[props.language];
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"idle" | "accept" | "reject">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const statusIsFinal =
    props.status === "accepted" ||
    props.status === "rejected" ||
    props.status === "expired" ||
    props.status === "converted";

  async function submit(type: "accept" | "reject") {
    if (name.trim().length < 2) {
      setError(props.language === "en" ? "Please enter your name" : "Vul je naam in");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/public/quotes/${props.token}/${type}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            reason: type === "reject" ? reason.trim() || null : undefined,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Mislukt");
        return;
      }
      setDone(type === "accept" ? "accepted" : "rejected");
      if (type === "accept" && data?.invoice_view_url) {
        setInvoiceUrl(data.invoice_view_url);
      }
      setMode("idle");
    } catch {
      setError(
        props.language === "en" ? "Connection error" : "Verbindingsfout",
      );
    } finally {
      setBusy(false);
    }
  }

  const showDoneState =
    done || props.status === "accepted" || props.status === "rejected";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#f4f4f5" }}
    >
      {/* Header band */}
      <div style={{ backgroundColor: props.accentColor, height: 6 }} />

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-8 py-8 md:py-16">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">
            {L.greeting}
          </p>
          <h1
            className="text-3xl md:text-4xl font-bold mt-1"
            style={{ color: "#111827" }}
          >
            {props.companyName}
          </h1>
        </header>

        <section className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-zinc-200">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                {L.for}
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-900">
                {props.clientName}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                {L.numberLabel}
              </p>
              <p className="mt-1 text-base font-mono text-zinc-900">
                {props.number}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                {L.validLabel}
              </p>
              <p className="mt-1 text-base text-zinc-900">
                {formatDate(props.validUntil, props.language)}
              </p>
            </div>
          </div>

          <div className="py-6 border-b border-zinc-200">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              {L.totalLabel}
            </p>
            <p
              className="mt-1 text-4xl font-bold font-mono"
              style={{ color: props.accentColor }}
            >
              {formatEUR(props.totalCents)}
            </p>
          </div>

          <div className="pt-6 pb-2">
            <a
              href={`/api/public/quotes/${props.token}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium inline-flex items-center gap-2"
              style={{ color: props.accentColor }}
            >
              📄 {L.downloadPdf}
            </a>
          </div>

          {/* Inline PDF preview */}
          <iframe
            src={`/api/public/quotes/${props.token}/pdf`}
            className="w-full h-[70vh] bg-zinc-100 rounded-lg border border-zinc-200 mt-4"
            title={`Quote ${props.number}`}
          />
        </section>

        {/* Actions */}
        {showDoneState ? (
          <DoneCard
            type={done || (props.status as "accepted" | "rejected")}
            copy={L}
            name={done ? name : props.acceptedByName || props.rejectedByName}
            accent={props.accentColor}
            invoiceUrl={invoiceUrl}
            language={props.language}
          />
        ) : statusIsFinal ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 mt-6 text-center">
            <XCircle className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
            <h2 className="text-lg font-semibold text-zinc-900">
              {props.status === "expired" ? L.expiredTitle : L.convertedTitle}
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              {props.status === "expired" ? L.expiredBody : L.convertedBody}
            </p>
          </div>
        ) : (
          <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => setMode("accept")}
              className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-white text-base font-semibold shadow-sm hover:opacity-90 transition"
              style={{ backgroundColor: props.accentColor }}
            >
              <Check className="w-5 h-5" />
              {L.accept}
            </button>
            <button
              onClick={() => setMode("reject")}
              className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-white text-zinc-600 text-base font-medium border border-zinc-300 hover:bg-zinc-50 transition"
            >
              <X className="w-5 h-5" />
              {L.reject}
            </button>
          </section>
        )}

        {/* Contact */}
        {(props.companyEmail || props.companyPhone) && (
          <footer className="mt-10 text-center text-sm text-zinc-500">
            <p className="font-medium text-zinc-700">{L.questions}</p>
            <div className="mt-2 flex items-center justify-center gap-4 flex-wrap">
              {props.companyEmail && (
                <a
                  href={`mailto:${props.companyEmail}`}
                  className="inline-flex items-center gap-1.5"
                >
                  <Mail className="w-4 h-4" />
                  {props.companyEmail}
                </a>
              )}
              {props.companyPhone && (
                <a
                  href={`tel:${props.companyPhone}`}
                  className="inline-flex items-center gap-1.5"
                >
                  <Phone className="w-4 h-4" />
                  {props.companyPhone}
                </a>
              )}
            </div>
          </footer>
        )}
      </div>

      {/* Modals */}
      {mode !== "idle" && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-zinc-900">
              {mode === "accept" ? L.acceptConfirmTitle : L.rejectTitle}
            </h2>
            <p className="text-sm text-zinc-600 mt-2">
              {mode === "accept" ? L.acceptConfirmBody : L.rejectBody}
            </p>
            <label className="block mt-4">
              <span className="block text-xs text-zinc-500 mb-1">
                {L.namePlaceholder}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 bg-white focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={
                  { "--tw-ring-color": props.accentColor } as React.CSSProperties
                }
              />
            </label>
            {mode === "reject" && (
              <label className="block mt-3">
                <span className="block text-xs text-zinc-500 mb-1">
                  {L.reasonPlaceholder}
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-zinc-900 placeholder-zinc-400 bg-white focus:outline-none"
                />
              </label>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setMode("idle");
                  setError("");
                }}
                disabled={busy}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800"
              >
                {L.cancel}
              </button>
              <button
                onClick={() => submit(mode)}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: props.accentColor }}
              >
                {busy ? "..." : L.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DoneCard({
  type,
  copy,
  name,
  accent,
  invoiceUrl,
  language,
}: {
  type: "accepted" | "rejected";
  copy: (typeof COPY)[Lang];
  name: string | null;
  accent: string;
  invoiceUrl?: string | null;
  language: Lang;
}) {
  const payLabel =
    language === "en"
      ? "View invoice & pay (iDEAL / card)"
      : "Factuur bekijken & betalen (iDEAL / creditcard)";
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 mt-6 text-center">
      {type === "accepted" ? (
        <CheckCircle2
          className="w-12 h-12 mx-auto mb-3"
          style={{ color: accent }}
        />
      ) : (
        <XCircle className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
      )}
      <h2 className="text-xl font-semibold text-zinc-900">
        {type === "accepted" ? copy.acceptedTitle : copy.rejectedTitle}
      </h2>
      <p className="text-sm text-zinc-600 mt-2">
        {type === "accepted" ? copy.acceptedBody : copy.rejectedBody}
      </p>
      {name && (
        <p className="text-xs text-zinc-500 mt-3">
          {type === "accepted" ? "Akkoord gegeven door" : "Afgewezen door"}{" "}
          <span className="font-medium text-zinc-700">{name}</span>
        </p>
      )}
      {type === "accepted" && invoiceUrl && (
        <a
          href={invoiceUrl}
          className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white text-sm font-semibold shadow-sm hover:opacity-90 transition"
          style={{ backgroundColor: accent }}
        >
          {payLabel}
        </a>
      )}
    </div>
  );
}
