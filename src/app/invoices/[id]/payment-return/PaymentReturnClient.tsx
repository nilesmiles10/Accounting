"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatEUR } from "@/lib/format";

type Lang = "nl" | "en";

const COPY = {
  nl: {
    paidTitle: "Betaling gelukt",
    paidBody:
      "Bedankt — je betaling is bij ons binnen. We nemen binnenkort contact op.",
    pendingTitle: "Betaling in verwerking",
    pendingBody:
      "Je betaling wordt verwerkt. Dit kan even duren; je ontvangt een bevestiging zodra het compleet is.",
    failedTitle: "Betaling niet voltooid",
    failedBody:
      "De betaling is niet afgerond. Je kunt terug naar de factuur en het opnieuw proberen, of neem contact op.",
    questions: "Vragen?",
    amount: "Bedrag",
    invoice: "Factuur",
  },
  en: {
    paidTitle: "Payment received",
    paidBody:
      "Thank you — your payment has arrived. We'll be in touch shortly.",
    pendingTitle: "Payment pending",
    pendingBody:
      "Your payment is being processed. This may take a moment; you'll receive confirmation once it's complete.",
    failedTitle: "Payment not completed",
    failedBody:
      "The payment wasn't finalised. Try again from the invoice, or contact us.",
    questions: "Questions?",
    amount: "Amount",
    invoice: "Invoice",
  },
} as const;

export default function PaymentReturnClient({
  number,
  status,
  mollieStatus,
  totalCents,
  companyName,
  companyEmail,
  accentColor,
  language,
}: {
  number: string;
  status: string;
  mollieStatus: string | null;
  totalCents: number;
  companyName: string;
  companyEmail: string | null;
  accentColor: string;
  language: Lang;
}) {
  const L = COPY[language];
  const paid = status === "paid" || mollieStatus === "paid";
  const pending = !paid && (mollieStatus === "pending" || mollieStatus === "open");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f4f5" }}>
      <div style={{ backgroundColor: accentColor, height: 6 }} />
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">
            {companyName}
          </p>
        </header>

        <section className="bg-white border border-zinc-200 rounded-2xl p-8 text-center shadow-sm">
          {paid ? (
            <CheckCircle2
              className="w-14 h-14 mx-auto mb-4"
              style={{ color: accentColor }}
            />
          ) : pending ? (
            <Clock className="w-14 h-14 mx-auto mb-4 text-amber-500" />
          ) : (
            <XCircle className="w-14 h-14 mx-auto mb-4 text-zinc-400" />
          )}

          <h1 className="text-2xl font-bold text-zinc-900">
            {paid ? L.paidTitle : pending ? L.pendingTitle : L.failedTitle}
          </h1>
          <p className="text-sm text-zinc-600 mt-2">
            {paid ? L.paidBody : pending ? L.pendingBody : L.failedBody}
          </p>

          <dl className="mt-8 text-sm grid grid-cols-2 gap-4 max-w-xs mx-auto text-left">
            <dt className="text-zinc-500">{L.invoice}</dt>
            <dd className="font-mono text-zinc-900">{number}</dd>
            <dt className="text-zinc-500">{L.amount}</dt>
            <dd className="font-mono text-zinc-900">{formatEUR(totalCents)}</dd>
          </dl>
        </section>

        {companyEmail && (
          <p className="mt-8 text-center text-sm text-zinc-500">
            {L.questions}{" "}
            <a
              href={`mailto:${companyEmail}`}
              style={{ color: accentColor }}
              className="hover:underline"
            >
              {companyEmail}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
