"use client";

import dynamic from "next/dynamic";
import type { Company } from "@/lib/companies";
import type { Client } from "@/lib/clients";
import type { InvoiceWithLines } from "@/lib/invoices";
import { InvoiceDocument } from "@/lib/pdf/InvoiceDocument";

/**
 * Client-side PDFViewer. Renders the actual invoice PDF live in an iframe as
 * the user edits — no server round-trip. @react-pdf/renderer is ~500 kB
 * gzipped so we lazy-load it only on the editor page (ssr:false).
 *
 * Note: client-side render does not have access to the logo on disk, so the
 * live preview shows the logo only after save (company.logo_path has been
 * set and we fetch it via /api/companies/:id/logo as a data URL).
 */
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false, loading: () => <PreviewLoading /> },
);

interface Props {
  invoice: InvoiceWithLines;
  company: Company;
  client: Client;
  logoDataUrl: string | null;
}

export default function LivePreview({
  invoice,
  company,
  client,
  logoDataUrl,
}: Props) {
  return (
    <div className="h-[80vh] rounded-lg overflow-hidden border border-[var(--border)] bg-zinc-100">
      <PDFViewer
        style={{ width: "100%", height: "100%", border: 0 }}
        showToolbar={true}
      >
        <InvoiceDocument
          invoice={invoice}
          company={company}
          client={client}
          logoDataUrl={logoDataUrl}
        />
      </PDFViewer>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="h-[80vh] flex items-center justify-center text-sm text-zinc-500 bg-zinc-100 rounded-lg border border-[var(--border)]">
      Preview laden…
    </div>
  );
}
