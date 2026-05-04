"use client";

import { CheckCircle2, CreditCard, Mail, Phone, Download } from "lucide-react";
import { formatEUR, formatDate } from "@/lib/format";

type Lang = "nl" | "en";

interface Props {
  token: string;
  number: string;
  status: string;
  language: Lang;
  totalCents: number;
  issueDate: string;
  dueDate: string;
  payUrl: string | null;
  mollieStatus: string | null;
  paidAt: number | null;
  companyName: string;
  companyEmail: string | null;
  companyPhone: string | null;
  accentColor: string;
  clientName: string;
}

const COPY = {
  nl: {
    greeting: "Factuur van",
    for: "Voor",
    numberLabel: "Factuurnr.",
    issueLabel: "Factuurdatum",
    dueLabel: "Vervaldatum",
    totalLabel: "Te betalen",
    pay: "Nu betalen (iDEAL / creditcard)",
    paidTitle: "Betaald",
    paidBody: "Deze factuur is voldaan — dank je wel.",
    downloadPdf: "Download PDF",
    questions: "Vragen?",
  },
  en: {
    greeting: "Invoice from",
    for: "Billed to",
    numberLabel: "Invoice no.",
    issueLabel: "Issue date",
    dueLabel: "Due date",
    totalLabel: "Amount due",
    pay: "Pay now (iDEAL / card)",
    paidTitle: "Paid",
    paidBody: "This invoice has been paid — thank you.",
    downloadPdf: "Download PDF",
    questions: "Questions?",
  },
} as const;

export default function InvoiceViewClient(props: Props) {
  const L = COPY[props.language];
  const isPaid = props.status === "paid" || props.mollieStatus === "paid";

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f4f4f5" }}>
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
                {L.dueLabel}
              </p>
              <p className="mt-1 text-base text-zinc-900">
                {formatDate(props.dueDate, props.language)}
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
              href={`/api/public/invoices/${props.token}/pdf?download=1`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium inline-flex items-center gap-2"
              style={{ color: props.accentColor }}
            >
              <Download className="w-4 h-4" />
              {L.downloadPdf}
            </a>
          </div>

          <iframe
            src={`/api/public/invoices/${props.token}/pdf`}
            className="w-full h-[70vh] bg-zinc-100 rounded-lg border border-zinc-200 mt-4"
            title={`Invoice ${props.number}`}
          />
        </section>

        {isPaid ? (
          <section className="bg-white border border-zinc-200 rounded-2xl p-6 md:p-8 mt-6 text-center">
            <CheckCircle2
              className="w-12 h-12 mx-auto mb-3"
              style={{ color: props.accentColor }}
            />
            <h2 className="text-xl font-semibold text-zinc-900">
              {L.paidTitle}
            </h2>
            <p className="text-sm text-zinc-600 mt-2">{L.paidBody}</p>
          </section>
        ) : props.payUrl ? (
          <section className="mt-6">
            <a
              href={props.payUrl}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-white text-base font-semibold shadow-sm hover:opacity-90 transition"
              style={{ backgroundColor: props.accentColor }}
            >
              <CreditCard className="w-5 h-5" />
              {L.pay}
            </a>
          </section>
        ) : null}

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
    </div>
  );
}
