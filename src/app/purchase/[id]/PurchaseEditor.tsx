"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  XCircle,
  FileText,
  ScanLine,
} from "lucide-react";
import type { Company } from "@/lib/companies";
import type { Supplier } from "@/lib/suppliers";
import type { Account } from "@/lib/ledger/accounts";
import type {
  PurchaseInvoiceWithLines,
  PurchaseLineInput,
} from "@/lib/purchase-invoices";
import {
  formatEUR,
  formatDate,
  parseEuroInput,
  parseQtyInput,
  formatQty,
} from "@/lib/format";

interface EditableLine extends PurchaseLineInput {
  key: string;
  qtyDraft: string;
  priceDraft: string;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "Concept", cls: "bg-zinc-700 text-zinc-300" },
  review: { text: "Review", cls: "bg-amber-500/15 text-amber-300" },
  approved: { text: "Goedgekeurd", cls: "bg-indigo-500/15 text-indigo-300" },
  paid: { text: "Betaald", cls: "bg-emerald-500/15 text-emerald-300" },
  cancelled: { text: "Geannuleerd", cls: "bg-zinc-800 text-zinc-500" },
};

export default function PurchaseEditor({
  invoice,
  companies,
  suppliers,
  accounts,
}: {
  invoice: PurchaseInvoiceWithLines;
  companies: Company[];
  suppliers: Supplier[];
  accounts: Account[];
}) {
  const router = useRouter();
  const editable =
    invoice.status === "draft" || invoice.status === "review";

  const [companyId, setCompanyId] = useState(invoice.company_id);
  const [supplierId, setSupplierId] = useState<string | null>(invoice.supplier_id);
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(
    invoice.supplier_invoice_number || "",
  );
  const [issueDate, setIssueDate] = useState(invoice.issue_date || "");
  const [dueDate, setDueDate] = useState(invoice.due_date || "");
  const [reference, setReference] = useState(invoice.reference || "");
  const [notes, setNotes] = useState(invoice.notes || "");

  const [lines, setLines] = useState<EditableLine[]>(
    invoice.lines.length
      ? invoice.lines.map((l, i) => ({
          key: String(i),
          description: l.description,
          quantity_milli: l.quantity_milli,
          unit: l.unit,
          unit_price_cents: l.unit_price_cents,
          vat_rate: l.vat_rate,
          account_code: l.account_code,
          qtyDraft: formatQty(l.quantity_milli),
          priceDraft: (l.unit_price_cents / 100).toFixed(2).replace(".", ","),
        }))
      : [blankLine(0)],
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const totals = lines.reduce(
    (acc, l) => {
      const sub = Math.round((l.quantity_milli * l.unit_price_cents) / 1000);
      const vat = Math.round((sub * l.vat_rate) / 100);
      return {
        subtotal: acc.subtotal + sub,
        vat: acc.vat + vat,
        total: acc.total + sub + vat,
      };
    },
    { subtotal: 0, vat: 0, total: 0 },
  );

  function setLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
    setSavedAt(null);
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine(prev.length)]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function onSupplierChange(id: string) {
    setSupplierId(id || null);
    if (!id) return;
    const s = suppliers.find((x) => x.id === id);
    if (!s) return;
    // Auto-fill default account_code op lege regels
    if (s.default_account_code) {
      setLines((prev) =>
        prev.map((l) =>
          !l.account_code ? { ...l, account_code: s.default_account_code } : l,
        ),
      );
    }
  }

  async function onSave() {
    setErr("");
    setBusy(true);
    try {
      const payload = {
        company_id: companyId,
        supplier_id: supplierId,
        supplier_invoice_number: supplierInvoiceNumber || null,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        reference: reference || null,
        notes: notes || null,
        lines: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            quantity_milli: l.quantity_milli,
            unit: l.unit || null,
            unit_price_cents: l.unit_price_cents,
            vat_rate: l.vat_rate,
            account_code: l.account_code || null,
          })),
      };
      const r = await fetch(`/api/purchase/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Opslaan mislukt");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!confirm("Inkoopfactuur goedkeuren? Daarna wordt deze geboekt zodra de boekhoudkern live is.")) return;
    setBusy(true);
    setErr("");
    try {
      // Eerst opslaan zodat huidige edits meegaan
      await onSave();
      const r = await fetch(`/api/purchase/${invoice.id}/approve`, {
        method: "POST",
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Goedkeuren mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onReOcr() {
    if (!invoice.pdf_path) {
      setErr("Geen PDF om te scannen");
      return;
    }
    if (
      !confirm(
        "OCR opnieuw uitvoeren? Bestaande regels worden overschreven met de nieuwe scan.",
      )
    )
      return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/purchase/${invoice.id}/ocr`, {
        method: "POST",
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "OCR mislukt");
        return;
      }
      window.location.reload();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onMarkPaid() {
    const today = new Date().toISOString().slice(0, 10);
    const paidDate = prompt(
      "Op welke datum is de factuur betaald? (YYYY-MM-DD)",
      today,
    );
    if (!paidDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
      setErr("Ongeldig datumformaat — gebruik YYYY-MM-DD");
      return;
    }
    const bankCode = prompt(
      "Vanaf welke bankrekening is betaald?\n1100 = Rabobank, 1110 = PayPal, 1120 = Revolut, 1130 = Creditcard",
      "1100",
    );
    if (!bankCode) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(
        `/api/purchase/${invoice.id}/mark-paid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bank_account_code: bankCode,
            paid_date: paidDate,
          }),
        },
      );
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Op betaald zetten mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!confirm("Factuur annuleren? Wordt niet geboekt.")) return;
    try {
      const r = await fetch(`/api/purchase/${invoice.id}/cancel`, {
        method: "POST",
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Annuleren mislukt");
        return;
      }
      router.refresh();
    } catch {
      setErr("Verbindingsfout");
    }
  }

  async function onDelete() {
    if (!confirm("Factuur verwijderen? Niet ongedaan te maken.")) return;
    try {
      const r = await fetch(`/api/purchase/${invoice.id}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Verwijderen mislukt");
        return;
      }
      router.push("/purchase");
    } catch {
      setErr("Verbindingsfout");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/purchase"
            className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Inkoop
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 mt-1 inline-flex items-center gap-3">
            {invoice.supplier_invoice_number || "Concept"}
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-normal ${
                STATUS_LABEL[invoice.status]?.cls || "bg-zinc-800"
              }`}
            >
              {STATUS_LABEL[invoice.status]?.text || invoice.status}
            </span>
          </h1>
          {invoice.issue_date && (
            <p className="text-xs text-zinc-500 mt-1">
              Datum: {formatDate(invoice.issue_date)}{" "}
              {invoice.due_date && `· vervalt ${formatDate(invoice.due_date)}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editable && (
            <>
              {invoice.pdf_path && (
                <button
                  onClick={onReOcr}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-40"
                  title="Scan PDF opnieuw met Claude — overschrijft regels"
                >
                  <ScanLine className="w-4 h-4" />
                  {busy ? "Scannen..." : "OCR opnieuw"}
                </button>
              )}
              <button
                onClick={onSave}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
                {busy ? "..." : "Opslaan"}
              </button>
              <button
                onClick={onApprove}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" />
                Goedkeuren
              </button>
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 text-sm rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
                Verwijderen
              </button>
            </>
          )}
          {invoice.status === "approved" && (
            <button
              onClick={onMarkPaid}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" />
              Markeer als betaald
            </button>
          )}
          {(invoice.status === "approved" || invoice.status === "paid") && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 text-sm rounded-lg"
            >
              <XCircle className="w-4 h-4" />
              Annuleren
            </button>
          )}
        </div>
      </header>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
          {err}
        </div>
      )}
      {savedAt && (
        <p className="text-xs text-emerald-400">Opgeslagen</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-6">
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">Partijen</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Eigen bedrijf">
                <select
                  disabled={!editable}
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="select"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Leverancier">
                <select
                  disabled={!editable}
                  value={supplierId || ""}
                  onChange={(e) => onSupplierChange(e.target.value)}
                  className="select"
                >
                  <option value="">— kies leverancier —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Factuurnummer leverancier">
                <input
                  type="text"
                  disabled={!editable}
                  value={supplierInvoiceNumber}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Factuurdatum">
                <input
                  type="date"
                  disabled={!editable}
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Vervaldatum">
                <input
                  type="date"
                  disabled={!editable}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Referentie / order">
                <input
                  type="text"
                  disabled={!editable}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          </section>

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-300">Regels</h2>
              {editable && (
                <button
                  onClick={addLine}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-md"
                >
                  <Plus className="w-3 h-3" />
                  Regel
                </button>
              )}
            </div>

            {/* Eén grootboekrekening voor de hele factuur. Bij ingewikkelde
                multi-post facturen kun je later per regel afwijken via
                "Geavanceerd" toggle. Voor 95% van de gevallen: alles op
                één post. */}
            <InvoiceAccountPicker
              lines={lines}
              accounts={accounts}
              editable={editable}
              onChange={(code) =>
                setLines((prev) =>
                  prev.map((l) => ({ ...l, account_code: code || null })),
                )
              }
            />

            <div className="space-y-2">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="grid grid-cols-12 gap-2 items-start p-3 bg-zinc-900/40 border border-[var(--border)] rounded-lg"
                >
                  <div className="col-span-12 md:col-span-7">
                    <input
                      type="text"
                      placeholder="Omschrijving"
                      disabled={!editable}
                      value={line.description}
                      onChange={(e) =>
                        setLine(line.key, { description: e.target.value })
                      }
                      className="input"
                    />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!editable}
                      value={line.qtyDraft}
                      onChange={(e) =>
                        setLine(line.key, {
                          qtyDraft: e.target.value,
                          quantity_milli: parseQtyInput(e.target.value),
                        })
                      }
                      className="input text-right"
                      title="Aantal"
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!editable}
                      placeholder="0,00"
                      value={line.priceDraft}
                      onChange={(e) =>
                        setLine(line.key, {
                          priceDraft: e.target.value,
                          unit_price_cents: parseEuroInput(e.target.value),
                        })
                      }
                      className="input text-right"
                      title="Stukprijs excl. BTW"
                    />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <select
                      disabled={!editable}
                      value={line.vat_rate}
                      onChange={(e) =>
                        setLine(line.key, {
                          vat_rate: parseInt(e.target.value) || 0,
                        })
                      }
                      className="select"
                    >
                      <option value="21">21%</option>
                      <option value="9">9%</option>
                      <option value="0">0%</option>
                    </select>
                  </div>
                  {editable && (
                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      <button
                        onClick={() => removeLine(line.key)}
                        className="p-1 text-zinc-600 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="text-right font-mono text-sm pt-2 border-t border-[var(--border)] space-y-0.5">
              <div className="text-zinc-400">
                Subtotaal: {formatEUR(totals.subtotal)}
              </div>
              <div className="text-zinc-400">
                BTW: {formatEUR(totals.vat)}
              </div>
              <div className="text-zinc-100 text-base font-semibold">
                Totaal: {formatEUR(totals.total)}
              </div>
            </div>
          </section>

          <BookingPreview
            lines={lines}
            supplierId={supplierId}
            suppliers={suppliers}
            accounts={accounts}
          />

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-2">
            <Field label="Notities">
              <textarea
                disabled={!editable}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="input"
              />
            </Field>
          </section>
        </div>

        {/* PDF */}
        <aside className="lg:sticky lg:top-4 self-start">
          {invoice.pdf_path ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
                <FileText className="w-4 h-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-300">
                  Origineel
                </h2>
              </div>
              {/\.(jpg|jpeg|png|webp|gif)$/i.test(invoice.pdf_path) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/purchase/${invoice.id}/pdf`}
                  className="w-full max-h-[80vh] object-contain bg-zinc-100"
                  alt="Inkoopfactuur foto"
                />
              ) : (
                <iframe
                  src={`/api/purchase/${invoice.id}/pdf`}
                  className="w-full h-[80vh] bg-zinc-100"
                  title="Inkoopfactuur PDF"
                />
              )}
            </div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center text-sm text-zinc-500">
              Geen bestand gekoppeld. Bij handmatige invoer is dat OK.
            </div>
          )}
        </aside>
      </div>

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
        :global(.input:disabled),
        :global(.select:disabled) {
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
      `}</style>
    </div>
  );
}

/**
 * Eén dropdown voor "alle regels op deze rekening". Voor de meeste
 * inkoopfacturen (SaaS, abonnementen, marketing-tools) hoort de hele
 * factuur op één post — splitsen per regel is uitzondering.
 *
 * Toont: huidige rekening (als alle regels gelijk zijn) of "Verschillend
 * per regel" als ze afwijken. Onchange: zet alle regels op de gekozen
 * rekening in één klap.
 */
function InvoiceAccountPicker({
  lines,
  accounts,
  editable,
  onChange,
}: {
  lines: EditableLine[];
  accounts: Account[];
  editable: boolean;
  onChange: (code: string) => void;
}) {
  // Boekbaar bij inkoop:
  //   - alle kosten-rekeningen (4xxx + 7000 inkoopwaarde)
  //   - vaste activa / voorraad (asset met code NIET beginnend met 1xxx)
  //     bv. 0500 Inventaris, 3000 Voorraad — die voegt user zelf toe
  //     via Grootboek CRUD wanneer relevant.
  // Niet boekbaar (systeem-rekeningen, automatisch ingevuld):
  //   - 1xxx activa (bank/debiteuren/BTW vorderingen)
  //   - alle passiva (1600 crediteuren, 1700 BTW, 1900 RC dir)
  //   - eigen vermogen, omzet — horen niet bij een inkoopfactuur
  const bookable = accounts.filter((a) => {
    if (a.active !== 1) return false;
    if (a.type === "expense") return true;
    if (a.type === "asset" && !a.code.startsWith("1")) return true;
    return false;
  });
  const expenseAccounts = bookable.filter((a) => a.type === "expense");
  const assetAccounts = bookable.filter((a) => a.type === "asset");
  const grouped = [
    { type: "expense", label: "Kosten", items: expenseAccounts },
    { type: "asset", label: "Activa (capex / voorraad)", items: assetAccounts },
  ].filter((g) => g.items.length > 0);

  // Bepaal huidige waarde: als alle non-empty codes gelijk zijn → die.
  // Anders "" (mixed of leeg).
  const codes = lines
    .map((l) => l.account_code?.trim())
    .filter((c): c is string => !!c);
  const allSame =
    codes.length > 0 && codes.every((c) => c === codes[0]);
  const allLinesHaveCode = codes.length === lines.length;
  const current = allSame ? codes[0]! : "";
  const isMixed = !allSame && codes.length > 0 && !allLinesHaveCode;

  return (
    <div className="space-y-1">
      <label className="block">
        <span className="block text-xs text-zinc-500 mb-1">
          Grootboekrekening — voor de hele factuur
        </span>
        <select
          disabled={!editable}
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">— kies een rekening —</option>
          {grouped.map((g) => (
            <optgroup key={g.type} label={g.label}>
              {g.items.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {isMixed && (
        <p className="text-[11px] text-amber-300">
          Regels staan op verschillende rekeningen. Kies één rekening om
          alles bij elkaar te zetten — anders blijven de huidige regels
          staan zoals ze zijn.
        </p>
      )}
      {!current && lines.length > 0 && (
        <p className="text-[11px] text-zinc-500">
          Niet ingevuld → alles wordt op{" "}
          <span className="font-mono">4000 Algemene kosten</span> geboekt.
        </p>
      )}
    </div>
  );
}

/**
 * Live preview van de boeking die ontstaat zodra je deze inkoopfactuur
 * goedkeurt. Toont per grootboekrekening het debet/credit-bedrag, plus
 * BTW vorderingen (1500) en de tegenboeking op crediteuren (1600).
 *
 * Lijnen zonder grootboek vallen automatisch op 4000 (Algemene kosten)
 * — dat wordt expliciet gemarkeerd zodat je ziet dat je 'm beter zelf
 * invult.
 */
function BookingPreview({
  lines,
  supplierId,
  suppliers,
  accounts,
}: {
  lines: EditableLine[];
  supplierId: string | null;
  suppliers: Supplier[];
  accounts: Account[];
}) {
  const accountMap = new Map(accounts.map((a) => [a.code, a.name]));
  const supplier = supplierId
    ? suppliers.find((s) => s.id === supplierId)
    : null;

  // Group regels per grootboekrekening (excl. BTW).
  const byAccount = new Map<
    string,
    { code: string; name: string; total_excl: number; vat: number; fallback: boolean }
  >();
  for (const l of lines) {
    if (!l.description.trim() && l.unit_price_cents === 0) continue;
    const sub = Math.round((l.quantity_milli * l.unit_price_cents) / 1000);
    const vat = Math.round((sub * l.vat_rate) / 100);
    const code = l.account_code?.trim() || "4000";
    const fallback = !l.account_code?.trim();
    const existing = byAccount.get(code);
    if (existing) {
      existing.total_excl += sub;
      existing.vat += vat;
      existing.fallback = existing.fallback || fallback;
    } else {
      byAccount.set(code, {
        code,
        name: accountMap.get(code) || "Onbekende rekening",
        total_excl: sub,
        vat,
        fallback,
      });
    }
  }

  const debetEntries = Array.from(byAccount.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const totalVat = debetEntries.reduce((s, e) => s + e.vat, 0);
  const totalIncl = debetEntries.reduce(
    (s, e) => s + e.total_excl + e.vat,
    0,
  );
  const hasFallback = debetEntries.some((e) => e.fallback);

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[var(--border)] bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-200">
          Boekingsoverzicht
        </h2>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Wat er geboekt wordt zodra je goedkeurt. Pas de grootboekrekening
          per regel aan om dit te beïnvloeden.
        </p>
      </header>
      <table className="w-full text-sm">
        <thead className="text-[10px] text-zinc-500 uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-2 font-medium w-20">Code</th>
            <th className="text-left px-4 py-2 font-medium">Rekening</th>
            <th className="text-right px-4 py-2 font-medium w-32">Debet</th>
            <th className="text-right px-4 py-2 font-medium w-32">Credit</th>
          </tr>
        </thead>
        <tbody>
          {debetEntries.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-3 text-sm text-zinc-500">
                Voeg regels toe om de boeking te zien.
              </td>
            </tr>
          )}
          {debetEntries.map((e) => (
            <tr
              key={e.code}
              className={`border-t border-[var(--border)] ${
                e.fallback ? "bg-amber-500/5" : ""
              }`}
            >
              <td className="px-4 py-2 font-mono text-zinc-400">
                {e.code}
              </td>
              <td className="px-4 py-2 text-zinc-200">
                {e.name}
                {e.fallback && (
                  <span className="ml-2 text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">
                    fallback — geen grootboek ingevuld
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right font-mono text-zinc-200">
                {formatEUR(e.total_excl)}
              </td>
              <td className="px-4 py-2 text-zinc-500"></td>
            </tr>
          ))}
          {totalVat > 0 && (
            <tr className="border-t border-[var(--border)]">
              <td className="px-4 py-2 font-mono text-zinc-400">1500</td>
              <td className="px-4 py-2 text-zinc-200">BTW vorderingen</td>
              <td className="px-4 py-2 text-right font-mono text-zinc-200">
                {formatEUR(totalVat)}
              </td>
              <td className="px-4 py-2"></td>
            </tr>
          )}
          {totalIncl > 0 && (
            <tr className="border-t border-[var(--border)] bg-zinc-900/40">
              <td className="px-4 py-2 font-mono text-zinc-400">1600</td>
              <td className="px-4 py-2 text-zinc-200">
                Crediteuren
                {supplier && (
                  <span className="ml-2 text-[10px] text-zinc-500">
                    — {supplier.name}
                  </span>
                )}
              </td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right font-mono text-zinc-200">
                {formatEUR(totalIncl)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {hasFallback && (
        <p className="px-4 py-2 text-[11px] text-amber-200 bg-amber-500/5 border-t border-amber-500/20">
          Eén of meer regels hebben geen grootboekrekening — die gaan op
          4000 (Algemene kosten). Vul de juiste rekening in op de regel
          hierboven voor een nettere boekhouding.
        </p>
      )}
    </section>
  );
}

function blankLine(index: number): EditableLine {
  return {
    key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    description: "",
    quantity_milli: 1000,
    unit: null,
    unit_price_cents: 0,
    vat_rate: 21,
    account_code: null,
    qtyDraft: "1",
    priceDraft: "0,00",
  };
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
