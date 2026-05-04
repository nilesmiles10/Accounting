"use client";

import dynamic from "next/dynamic";
import type { Company } from "@/lib/companies";
import type { Client } from "@/lib/clients";
import type { QuoteWithLines } from "@/lib/quotes";
import { QuoteDocument } from "@/lib/pdf/QuoteDocument";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <Loading /> },
);

export default function LivePreviewQuote({
  quote,
  company,
  client,
  logoDataUrl,
}: {
  quote: QuoteWithLines;
  company: Company;
  client: Client;
  logoDataUrl: string | null;
}) {
  return (
    <div className="h-[80vh] rounded-lg overflow-hidden border border-[var(--border)] bg-zinc-100">
      <PDFViewer
        style={{ width: "100%", height: "100%", border: 0 }}
        showToolbar
      >
        <QuoteDocument
          quote={quote}
          company={company}
          client={client}
          logoDataUrl={logoDataUrl}
        />
      </PDFViewer>
    </div>
  );
}

function Loading() {
  return (
    <div className="h-[80vh] flex items-center justify-center text-sm text-zinc-500 bg-zinc-100 rounded-lg">
      Preview laden…
    </div>
  );
}
