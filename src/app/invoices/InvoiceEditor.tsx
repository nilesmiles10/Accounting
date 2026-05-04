"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  Send,
  ArrowLeft,
  AlertCircle,
  Eye,
  Calculator,
  Package,
} from "lucide-react";
import ItemPicker from "@/app/shared/ItemPicker";
import type { Company } from "@/lib/companies";
import type { Client, ClientListItem } from "@/lib/clients";
import type {
  InvoiceWithLines,
  InvoiceLine,
  VatTreatment,
  LineInput,
} from "@/lib/invoices";
import {
  formatEUR,
  formatQty,
  parseEuroInput,
  parseQtyInput,
} from "@/lib/format";
import LivePreview from "./LivePreview";

interface EditableLine extends LineInput {
  key: string;
  qtyDraft: string;
  priceDraft: string;
}

interface Props {
  companies: Company[];
  clients: ClientListItem[];
  invoice?: InvoiceWithLines;
}

const VAT_TREATMENT_LABEL: Record<VatTreatment, string> = {
  standard: "Binnenland (21 / 9 / 0%)",
  reverse_charge_eu: "BTW verlegd (intracommunautair B2B)",
  export_outside_eu: "Export buiten EU (0%)",
};

export default function InvoiceEditor({
  companies,
  clients,
  invoice,
}: Props) {
  const router = useRouter();

  const [companyId, setCompanyId] = useState(
    invoice?.company_id || companies[0]?.id || "",
  );
  const [clientId, setClientId] = useState(
    invoice?.client_id || clients[0]?.id || "",
  );
  const [issueDate, setIssueDate] = useState(
    invoice?.issue_date || new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(
    invoice?.due_date ||
      addDays(new Date().toISOString().slice(0, 10), defaultTerms(companies[0])),
  );
  const [language, setLanguage] = useState<"nl" | "en">(
    invoice?.language || companies[0]?.default_language || "nl",
  );
  const [treatment, setTreatment] = useState<VatTreatment>(
    invoice?.vat_treatment || "standard",
  );
  const [reference, setReference] = useState(invoice?.reference || "");
  const [notes, setNotes] = useState(invoice?.notes || "");
  const [termsText, setTermsText] = useState(
    invoice?.terms_text || companies[0]?.default_terms_text || "",
  );

  const [lines, setLines] = useState<EditableLine[]>(
    invoice?.lines.length
      ? invoice.lines.map((l, i) => ({
          key: String(i),
          description: l.description,
          quantity_milli: l.quantity_milli,
          unit: l.unit,
          unit_price_cents: l.unit_price_cents,
          vat_rate: l.vat_rate,
          qtyDraft: formatQty(l.quantity_milli),
          priceDraft: (l.unit_price_cents / 100)
            .toFixed(2)
            .replace(".", ","),
        }))
      : [blankLine(0)],
  );

  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<"totals" | "preview">("totals");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const company = companies.find((c) => c.id === companyId);
    if (!company?.logo_path) {
      setLogoDataUrl(null);
      return;
    }
    fetch(`/api/companies/${companyId}/logo`)
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            if (!blob) return resolve(null);
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }),
      )
      .then((url) => {
        if (!cancelled) setLogoDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLogoDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, companies]);

  const isDraft = !invoice || invoice.status === "draft";

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    const byRate = new Map<
      number,
      { rate: number; base: number; vat: number }
    >();
    for (const l of lines) {
      const sub = Math.round((l.quantity_milli * l.unit_price_cents) / 1000);
      const effectiveRate = treatment === "standard" ? l.vat_rate : 0;
      const v = Math.round((sub * effectiveRate) / 100);
      subtotal += sub;
      vat += v;
      const entry = byRate.get(effectiveRate) ?? {
        rate: effectiveRate,
        base: 0,
        vat: 0,
      };
      entry.base += sub;
      entry.vat += v;
      byRate.set(effectiveRate, entry);
    }
    return {
      subtotal,
      vat,
      total: subtotal + vat,
      byRate: Array.from(byRate.values()).sort((a, b) => a.rate - b.rate),
    };
  }, [lines, treatment]);

  const selectedCompany = companies.find((c) => c.id === companyId);
  const selectedClient = clients.find((c) => c.id === clientId);

  const previewInvoice: InvoiceWithLines = useMemo(() => {
    const now = Date.now();
    const effectiveLines: InvoiceLine[] = lines
      .filter((l) => l.description.trim().length > 0)
      .map((l, idx) => {
        const sub = Math.round(
          (l.quantity_milli * l.unit_price_cents) / 1000,
        );
        const effectiveRate = treatment === "standard" ? l.vat_rate : 0;
        const v = Math.round((sub * effectiveRate) / 100);
        return {
          id: `preview-${idx}`,
          invoice_id: invoice?.id || "preview",
          sort_order: idx,
          description: l.description,
          quantity_milli: l.quantity_milli,
          unit: l.unit || null,
          unit_price_cents: l.unit_price_cents,
          vat_rate: l.vat_rate,
          line_total_cents: sub,
          line_vat_cents: v,
        };
      });

    return {
      id: invoice?.id || "preview",
      company_id: companyId,
      client_id: clientId,
      number:
        invoice?.status && invoice.status !== "draft"
          ? invoice.number
          : (language === "en" ? "DRAFT" : "CONCEPT"),
      status: invoice?.status || "draft",
      language,
      currency: "EUR",
      issue_date: issueDate,
      due_date: dueDate,
      subtotal_cents: totals.subtotal,
      vat_total_cents: totals.vat,
      total_cents: totals.total,
      vat_treatment: treatment,
      reference: reference || null,
      notes: notes || null,
      terms_text: termsText || null,
      pdf_path: null,
      sent_at: null,
      paid_at: null,
      cancelled_at: null,
      postmark_message_id: null,
      company_snapshot_json: null,
      client_snapshot_json: null,
      open_count: 0,
      last_opened_at: null,
      link_click_count: 0,
      last_clicked_at: null,
      mollie_payment_id: null,
      mollie_payment_url: null,
      mollie_status: null,
      mollie_paid_at: null,
      public_token: null,
      reminder_count: 0,
      last_reminder_at: null,
      is_credit_note: invoice?.is_credit_note ?? 0,
      credits_invoice_id: invoice?.credits_invoice_id ?? null,
      created_at: invoice?.created_at || now,
      updated_at: now,
      lines: effectiveLines,
    };
  }, [
    invoice,
    companyId,
    clientId,
    language,
    issueDate,
    dueDate,
    treatment,
    reference,
    notes,
    termsText,
    lines,
    totals,
  ]);

  const previewClient: Client | null = selectedClient
    ? {
        id: selectedClient.id,
        name: selectedClient.name,
        contact_name: selectedClient.contact_name,
        email: selectedClient.email,
        phone: selectedClient.phone,
        kvk: selectedClient.kvk,
        vat_number: selectedClient.vat_number,
        address_line1: selectedClient.address_line1,
        address_line2: selectedClient.address_line2,
        postal_code: selectedClient.postal_code,
        city: selectedClient.city,
        country: selectedClient.country,
        notes: selectedClient.notes,
        created_at: selectedClient.created_at,
        updated_at: selectedClient.updated_at,
      }
    : null;

  function onCompanyChange(id: string) {
    setCompanyId(id);
    const c = companies.find((x) => x.id === id);
    if (c) {
      if (!invoice) {
        setLanguage(c.default_language);
        setTermsText(c.default_terms_text || "");
        setDueDate(addDays(issueDate, c.default_payment_terms_days));
      }
    }
  }

  function onClientChange(id: string) {
    setClientId(id);
    if (invoice) return;
    const c = clients.find((x) => x.id === id);
    const comp = companies.find((x) => x.id === companyId);
    if (c && comp) {
      setTreatment(suggestTreatment(comp.country, c.country, c.vat_number));
      // Taal-suggestie: NL-klant → NL, anders EN. Overschrijf alleen voor
      // nieuwe facturen zodat een expliciete override blijft staan zodra
      // de gebruiker iets heeft gewijzigd (mode=edit valt hier al uit).
      const clientCountry = (c.country || "NL").toUpperCase();
      setLanguage(clientCountry === "NL" ? "nl" : "en");
    }
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine(prev.length)]);
  }

  function addLineFromItem(data: {
    description: string;
    unit: string;
    unit_price_cents: number;
    vat_rate: number;
  }) {
    setLines((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}-${Math.random().toString(36).slice(2, 6)}`,
        description: data.description,
        quantity_milli: 1000,
        unit: data.unit,
        unit_price_cents: data.unit_price_cents,
        vat_rate: data.vat_rate,
        qtyDraft: "1",
        priceDraft: (data.unit_price_cents / 100)
          .toFixed(2)
          .replace(".", ","),
      },
    ]);
    setSavedAt(null);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function moveLine(key: string, direction: -1 | 1) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
    setSavedAt(null);
  }

  function toLinePayload(): LineInput[] {
    return lines
      .filter((l) => l.description.trim().length > 0)
      .map((l) => ({
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit || null,
        unit_price_cents: l.unit_price_cents,
        vat_rate: l.vat_rate,
      }));
  }

  async function save(): Promise<string | null> {
    setError("");
    setSaving(true);
    const payload = {
      company_id: companyId,
      client_id: clientId,
      language,
      issue_date: issueDate,
      due_date: dueDate,
      vat_treatment: treatment,
      reference: reference || null,
      notes: notes || null,
      terms_text: termsText || null,
      lines: toLinePayload(),
    };
    try {
      if (invoice) {
        const res = await fetch(`/api/invoices/${invoice.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Opslaan mislukt");
          return null;
        }
        setSavedAt(Date.now());
        return invoice.id;
      } else {
        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Aanmaken mislukt");
          return null;
        }
        setSavedAt(Date.now());
        router.push(`/invoices/${data.invoice.id}`);
        return data.invoice.id;
      }
    } catch {
      setError("Verbindingsfout");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function onFinalize() {
    if (!invoice) return;
    if (lines.filter((l) => l.description.trim()).length === 0) {
      setError("Factuur heeft geen regels");
      return;
    }
    if (
      !confirm(
        "Factuur finaliseren? Er wordt een definitief nummer toegekend en de factuur wordt niet meer bewerkbaar.",
      )
    )
      return;
    const id = await save();
    if (!id) return;
    setFinalizing(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${id}/finalize`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Finaliseren mislukt");
        return;
      }
      // Hard reload — de pagina switcht van editor naar detail-view en de
      // iframe-PDF moet gegarandeerd vers worden opgehaald. router.refresh
      // alleen bleek in sommige browsers de iframe niet te herladen.
      window.location.href = `/invoices/${id}`;
    } catch {
      setError("Verbindingsfout");
    } finally {
      setFinalizing(false);
    }
  }

  async function onDelete() {
    if (!invoice) return;
    if (!confirm("Concept-factuur verwijderen?")) return;
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verwijderen mislukt");
        return;
      }
      router.push("/invoices");
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    }
  }

  if (companies.length === 0 || clients.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-amber-500/30 rounded-xl p-6">
        <AlertCircle className="w-5 h-5 text-amber-400 mb-2" />
        <p className="text-sm text-zinc-200 font-medium">
          Je hebt minimaal één bedrijf en één klant nodig om een factuur aan te
          maken.
        </p>
        <div className="mt-3 flex gap-3 text-sm">
          {companies.length === 0 && (
            <Link
              href="/settings/companies"
              className="text-emerald-400 hover:text-emerald-300"
            >
              → Bedrijven aanmaken
            </Link>
          )}
          {clients.length === 0 && (
            <Link
              href="/clients"
              className="text-emerald-400 hover:text-emerald-300"
            >
              → Klanten aanmaken
            </Link>
          )}
        </div>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-zinc-100 mt-1">
            {invoice
              ? invoice.status === "draft"
                ? "Concept-factuur"
                : `Factuur ${invoice.number}`
              : "Nieuwe factuur"}
          </h1>
          {invoice && invoice.status !== "draft" && (
            <p className="text-xs text-zinc-500 mt-1">
              Deze factuur is {statusLabel(invoice.status)} en niet bewerkbaar.
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          {/* Parties */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">Partijen</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Bedrijf (van)">
                <select
                  disabled={!isDraft}
                  value={companyId}
                  onChange={(e) => onCompanyChange(e.target.value)}
                  className="select"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Klant (aan)">
                <select
                  disabled={!isDraft}
                  value={clientId}
                  onChange={(e) => onClientChange(e.target.value)}
                  className="select"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.vat_number ? ` — ${c.vat_number}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Meta */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Factuurdatum">
                <input
                  type="date"
                  disabled={!isDraft}
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Vervaldatum">
                <input
                  type="date"
                  disabled={!isDraft}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Taal">
                <select
                  disabled={!isDraft}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "nl" | "en")}
                  className="select"
                >
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="BTW-behandeling">
                <select
                  disabled={!isDraft}
                  value={treatment}
                  onChange={(e) =>
                    setTreatment(e.target.value as VatTreatment)
                  }
                  className="select"
                >
                  {(
                    Object.keys(VAT_TREATMENT_LABEL) as VatTreatment[]
                  ).map((k) => (
                    <option key={k} value={k}>
                      {VAT_TREATMENT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Referentie / PO-nummer (optioneel)">
                <input
                  type="text"
                  disabled={!isDraft}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          </section>

          {/* Lines */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-300">
                Factuurregels
              </h2>
              {isDraft && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-md transition-colors"
                  >
                    <Package className="w-3 h-3" />
                    Uit catalog
                  </button>
                  <button
                    onClick={addLine}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Regel toevoegen
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <LineRow
                  key={line.key}
                  line={line}
                  index={idx}
                  total={lines.length}
                  readOnly={!isDraft}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={() => removeLine(line.key)}
                  onMoveUp={() => moveLine(line.key, -1)}
                  onMoveDown={() => moveLine(line.key, 1)}
                />
              ))}
            </div>
          </section>

          {/* Notes & terms */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">
              Notities & voorwaarden
            </h2>
            <Field label="Notities op factuur (zichtbaar voor klant)">
              <textarea
                disabled={!isDraft}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input"
              />
            </Field>
            <Field label="Betalingsvoorwaarden">
              <textarea
                disabled={!isDraft}
                value={termsText}
                onChange={(e) => setTermsText(e.target.value)}
                rows={2}
                className="input"
              />
            </Field>
          </section>
        </div>

        {/* Right column: tabs (Totalen / Preview) + acties */}
        <aside className="space-y-4 lg:sticky lg:top-4 self-start">
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setRightTab("totals")}
                className={`flex-1 px-4 py-2.5 text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors ${
                  rightTab === "totals"
                    ? "bg-zinc-900/40 text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                Totalen
              </button>
              <button
                onClick={() => setRightTab("preview")}
                className={`flex-1 px-4 py-2.5 text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors ${
                  rightTab === "preview"
                    ? "bg-zinc-900/40 text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
            </div>

            {rightTab === "totals" ? (
              <div className="p-5">
                <dl className="space-y-1.5 text-sm">
                  <Row label="Subtotaal" value={formatEUR(totals.subtotal)} />
                  {totals.byRate.map((b) => (
                    <Row
                      key={b.rate}
                      label={`BTW ${b.rate}%`}
                      sublabel={`over ${formatEUR(b.base)}`}
                      value={formatEUR(b.vat)}
                    />
                  ))}
                  <div className="pt-2 mt-2 border-t border-[var(--border)]">
                    <Row
                      label="Totaal"
                      value={formatEUR(totals.total)}
                      bold
                    />
                  </div>
                </dl>
                {treatment !== "standard" && (
                  <p className="mt-3 text-[11px] text-amber-300/80 bg-amber-500/5 border border-amber-500/20 rounded-md px-2 py-1.5">
                    {treatment === "reverse_charge_eu"
                      ? "BTW verlegd — het BTW-tarief per regel wordt genegeerd."
                      : "Export buiten EU — 0% BTW op alle regels."}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3">
                {selectedCompany && previewClient ? (
                  <LivePreview
                    invoice={previewInvoice}
                    company={selectedCompany}
                    client={previewClient}
                    logoDataUrl={logoDataUrl}
                  />
                ) : (
                  <p className="text-xs text-zinc-500 p-4 text-center">
                    Selecteer bedrijf en klant om preview te zien.
                  </p>
                )}
              </div>
            )}
          </section>

          {isDraft && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-2">
              <button
                onClick={save}
                disabled={saving || finalizing}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
              >
                <Check className="w-4 h-4" />
                {saving ? "Opslaan..." : invoice ? "Opslaan" : "Concept opslaan"}
              </button>
              {invoice && (
                <>
                  <button
                    onClick={onFinalize}
                    disabled={saving || finalizing}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    {finalizing ? "Bezig..." : "Finaliseren & nummer toekennen"}
                  </button>
                  <button
                    onClick={onDelete}
                    disabled={saving || finalizing}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Concept verwijderen
                  </button>
                </>
              )}
              {savedAt && (
                <p className="text-[11px] text-emerald-400 text-center">
                  Opgeslagen
                </p>
              )}
              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}
            </section>
          )}

          {selectedCompany && selectedClient && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-zinc-500 space-y-2">
              <div>
                <p className="font-semibold text-zinc-300">
                  {selectedCompany.name}
                </p>
                <p>{selectedCompany.kvk && `KvK: ${selectedCompany.kvk}`}</p>
                <p>
                  {selectedCompany.vat_number &&
                    `BTW: ${selectedCompany.vat_number}`}
                </p>
              </div>
              <div className="pt-2 border-t border-[var(--border)]">
                <p className="font-semibold text-zinc-300">
                  {selectedClient.name}
                </p>
                {selectedClient.vat_number && (
                  <p>BTW: {selectedClient.vat_number}</p>
                )}
                {selectedClient.city && (
                  <p>
                    {selectedClient.city}, {selectedClient.country}
                  </p>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>

      {pickerOpen && isDraft && (
        <ItemPicker
          companyId={companyId}
          onPick={addLineFromItem}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: rgb(24 24 27);
          border: 1px solid rgb(63 63 70);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: rgb(228 228 231);
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgb(16 185 129);
          box-shadow: 0 0 0 1px rgb(16 185 129);
        }
        :global(.input:disabled) {
          opacity: 0.6;
          cursor: not-allowed;
        }
        :global(.select) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: rgb(24 24 27);
          border: 1px solid rgb(63 63 70);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: rgb(228 228 231);
        }
        :global(.select:disabled) {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function LineRow({
  line,
  index,
  total,
  readOnly,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  line: EditableLine;
  index: number;
  total: number;
  readOnly: boolean;
  onChange: (patch: Partial<EditableLine>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const subtotal = Math.round((line.quantity_milli * line.unit_price_cents) / 1000);
  return (
    <div className="grid grid-cols-12 gap-2 items-start p-3 bg-zinc-900/40 border border-[var(--border)] rounded-lg">
      <div className="col-span-12 md:col-span-5">
        <input
          type="text"
          placeholder="Omschrijving"
          disabled={readOnly}
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="input"
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <input
          type="text"
          inputMode="decimal"
          placeholder="1"
          disabled={readOnly}
          value={line.qtyDraft}
          onChange={(e) => {
            const qtyDraft = e.target.value;
            onChange({
              qtyDraft,
              quantity_milli: parseQtyInput(qtyDraft),
            });
          }}
          className="input text-right"
          title="Hoeveelheid"
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <input
          type="text"
          placeholder="uur"
          disabled={readOnly}
          value={line.unit || ""}
          onChange={(e) => onChange({ unit: e.target.value })}
          className="input"
          title="Eenheid"
        />
      </div>
      <div className="col-span-6 md:col-span-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          disabled={readOnly}
          value={line.priceDraft}
          onChange={(e) => {
            const priceDraft = e.target.value;
            onChange({
              priceDraft,
              unit_price_cents: parseEuroInput(priceDraft),
            });
          }}
          className="input text-right"
          title="Stukprijs excl. BTW"
        />
      </div>
      <div className="col-span-6 md:col-span-1">
        <select
          disabled={readOnly}
          value={line.vat_rate}
          onChange={(e) =>
            onChange({ vat_rate: parseInt(e.target.value) || 0 })
          }
          className="select"
          title="BTW-tarief per regel"
        >
          <option value="21">21%</option>
          <option value="9">9%</option>
          <option value="0">0%</option>
        </select>
      </div>
      <div className="col-span-10 md:col-span-1 text-right text-sm text-zinc-300 font-mono pt-2">
        {formatEUR(subtotal)}
      </div>
      {!readOnly && (
        <div className="col-span-2 md:col-span-1 flex items-center gap-0.5 justify-end">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded text-zinc-600 hover:text-zinc-200 disabled:opacity-30"
            aria-label="Omhoog"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded text-zinc-600 hover:text-zinc-200 disabled:opacity-30"
            aria-label="Omlaag"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded text-zinc-600 hover:text-red-400"
            aria-label="Regel verwijderen"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Row({
  label,
  sublabel,
  value,
  bold,
}: {
  label: string;
  sublabel?: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <div>
        <dt
          className={`${bold ? "text-zinc-100 font-semibold" : "text-zinc-400"}`}
        >
          {label}
        </dt>
        {sublabel && <p className="text-[10px] text-zinc-600">{sublabel}</p>}
      </div>
      <dd
        className={`font-mono ${bold ? "text-zinc-100 font-semibold text-lg" : "text-zinc-200"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function blankLine(index: number): EditableLine {
  return {
    key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    description: "",
    quantity_milli: 1000,
    unit: "stuk",
    unit_price_cents: 0,
    vat_rate: 21,
    qtyDraft: "1",
    priceDraft: "0,00",
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultTerms(company: Company | undefined): number {
  return company?.default_payment_terms_days ?? 14;
}

function statusLabel(s: string): string {
  return (
    {
      sent: "verstuurd",
      paid: "betaald",
      overdue: "te laat",
      cancelled: "geannuleerd",
    }[s] || s
  );
}

const EU = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK",
]);

function suggestTreatment(
  from: string | null,
  to: string | null,
  vat: string | null,
): VatTreatment {
  const a = (from || "NL").toUpperCase();
  const b = (to || "NL").toUpperCase();
  if (a === b) return "standard";
  if (EU.has(b) && vat) return "reverse_charge_eu";
  if (!EU.has(b)) return "export_outside_eu";
  return "standard";
}
