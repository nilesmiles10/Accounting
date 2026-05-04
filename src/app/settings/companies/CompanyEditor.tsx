"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Check, Upload, ImageOff, Palette } from "lucide-react";
import type { Company, CompanyUpdate } from "@/lib/companies";

export default function CompanyEditor({ initial }: { initial: Company }) {
  const router = useRouter();
  const [company, setCompany] = useState<Company>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const logoSrc = company.logo_path
    ? `/api/companies/${company.id}/logo?v=${company.updated_at}`
    : null;

  async function onUploadLogo(file: File) {
    setError("");
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(
        `/api/companies/${company.id}/logo`,
        { method: "POST", body: fd },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload mislukt");
        return;
      }
      setCompany((c) => ({
        ...c,
        logo_path: data.logo_path,
        updated_at: Date.now(),
      }));
    } catch {
      setError("Verbindingsfout");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function onRemoveLogo() {
    if (!confirm("Logo verwijderen?")) return;
    try {
      const res = await fetch(
        `/api/companies/${company.id}/logo`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError("Verwijderen mislukt");
        return;
      }
      setCompany((c) => ({ ...c, logo_path: null, updated_at: Date.now() }));
    } catch {
      setError("Verbindingsfout");
    }
  }

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setCompany((c) => ({ ...c, [key]: value }));
    setSavedAt(null);
  }

  async function onSave() {
    setError("");
    setSaving(true);
    const patch: CompanyUpdate = {
      name: company.name,
      legal_name: company.legal_name,
      kvk: company.kvk,
      vat_number: company.vat_number,
      iban: company.iban,
      bic: company.bic,
      email: company.email,
      phone: company.phone,
      website: company.website,
      address_line1: company.address_line1,
      address_line2: company.address_line2,
      postal_code: company.postal_code,
      city: company.city,
      country: company.country,
      accent_color: company.accent_color,
      default_language: company.default_language,
      default_payment_terms_days: company.default_payment_terms_days,
      default_terms_text: company.default_terms_text,
      invoice_number_prefix: company.invoice_number_prefix,
      invoice_number_next: company.invoice_number_next,
      invoice_number_padding: company.invoice_number_padding,
      sender_email: company.sender_email,
      reply_to_email: company.reply_to_email,
      email_subject_nl: company.email_subject_nl,
      email_subject_en: company.email_subject_en,
      email_body_nl: company.email_body_nl,
      email_body_en: company.email_body_en,
      reminder_days_after_send: company.reminder_days_after_send,
      reminder_days_before_expiry: company.reminder_days_before_expiry,
      reminder_subject_nl: company.reminder_subject_nl,
      reminder_subject_en: company.reminder_subject_en,
      reminder_body_nl: company.reminder_body_nl,
      reminder_body_en: company.reminder_body_en,
      expiry_subject_nl: company.expiry_subject_nl,
      expiry_subject_en: company.expiry_subject_en,
      expiry_body_nl: company.expiry_body_nl,
      expiry_body_en: company.expiry_body_en,
      quote_email_subject_nl: company.quote_email_subject_nl,
      quote_email_subject_en: company.quote_email_subject_en,
      quote_email_body_nl: company.quote_email_body_nl,
      quote_email_body_en: company.quote_email_body_en,
      owner_notify_accepted_subject: company.owner_notify_accepted_subject,
      owner_notify_accepted_body: company.owner_notify_accepted_body,
      owner_notify_rejected_subject: company.owner_notify_rejected_subject,
      owner_notify_rejected_body: company.owner_notify_rejected_body,
      invoice_reminder_days_after_due:
        company.invoice_reminder_days_after_due,
      invoice_reminder_repeat_days: company.invoice_reminder_repeat_days,
      invoice_reminder_max: company.invoice_reminder_max,
      invoice_reminder_subject_nl: company.invoice_reminder_subject_nl,
      invoice_reminder_subject_en: company.invoice_reminder_subject_en,
      invoice_reminder_body_nl: company.invoice_reminder_body_nl,
      invoice_reminder_body_en: company.invoice_reminder_body_en,
    };
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Opslaan mislukt");
        return;
      }
      setCompany(data.company);
      setSavedAt(Date.now());
    } catch {
      setError("Verbindingsfout");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Bedrijf "${company.name}" verwijderen?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verwijderen mislukt");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Verbindingsfout");
    }
  }

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{
              backgroundColor: (company.accent_color || "#6366f1") + "30",
              color: company.accent_color || "#6366f1",
            }}
          >
            {(company.name[0] || "?").toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {company.name}
            </h2>
            <p className="text-xs text-zinc-500">
              Prefix: {company.invoice_number_prefix || "—"} · Volgende nr:{" "}
              {company.invoice_number_next}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/settings/companies/${company.id}/template`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors"
          >
            <Palette className="w-3.5 h-3.5" />
            Template
          </Link>
          <button
            onClick={onDelete}
            className="p-2 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label={`${company.name} verwijderen`}
            title="Verwijderen (alleen als geen facturen)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Handelsnaam">
          <Input value={company.name} onChange={(v) => set("name", v)} />
        </Field>
        <Field label="Statutaire naam">
          <Input
            value={company.legal_name || ""}
            onChange={(v) => set("legal_name", v || null)}
          />
        </Field>
        <Field label="KvK-nummer">
          <Input
            value={company.kvk || ""}
            onChange={(v) => set("kvk", v || null)}
          />
        </Field>
        <Field label="BTW-nummer">
          <Input
            value={company.vat_number || ""}
            onChange={(v) => set("vat_number", v || null)}
          />
        </Field>
        <Field label="IBAN">
          <Input
            value={company.iban || ""}
            onChange={(v) => set("iban", v || null)}
          />
        </Field>
        <Field label="BIC">
          <Input
            value={company.bic || ""}
            onChange={(v) => set("bic", v || null)}
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={company.email || ""}
            onChange={(v) => set("email", v || null)}
          />
        </Field>
        <Field label="Telefoon">
          <Input
            value={company.phone || ""}
            onChange={(v) => set("phone", v || null)}
          />
        </Field>
        <Field label="Website">
          <Input
            value={company.website || ""}
            onChange={(v) => set("website", v || null)}
          />
        </Field>
        <Field label="Accent­kleur">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={company.accent_color || "#6366f1"}
              onChange={(e) => set("accent_color", e.target.value)}
              className="w-10 h-9 rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
            />
            <Input
              value={company.accent_color || ""}
              onChange={(v) => set("accent_color", v)}
            />
          </div>
        </Field>
        <Field label="Adres regel 1">
          <Input
            value={company.address_line1 || ""}
            onChange={(v) => set("address_line1", v || null)}
          />
        </Field>
        <Field label="Adres regel 2">
          <Input
            value={company.address_line2 || ""}
            onChange={(v) => set("address_line2", v || null)}
          />
        </Field>
        <Field label="Postcode">
          <Input
            value={company.postal_code || ""}
            onChange={(v) => set("postal_code", v || null)}
          />
        </Field>
        <Field label="Plaats">
          <Input
            value={company.city || ""}
            onChange={(v) => set("city", v || null)}
          />
        </Field>
        <Field label="Land (ISO-2)">
          <Input
            value={company.country || ""}
            onChange={(v) => set("country", v || null)}
          />
        </Field>
        <Field label="Standaardtaal">
          <select
            value={company.default_language}
            onChange={(e) =>
              set("default_language", e.target.value as "nl" | "en")
            }
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="nl">Nederlands</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label="Betaaltermijn (dagen)">
          <Input
            type="number"
            value={String(company.default_payment_terms_days)}
            onChange={(v) =>
              set("default_payment_terms_days", Math.max(0, parseInt(v) || 0))
            }
          />
        </Field>
        <Field label="Factuurnr. prefix">
          <Input
            value={company.invoice_number_prefix}
            onChange={(v) => set("invoice_number_prefix", v)}
          />
        </Field>
        <Field label="Volgend factuurnummer">
          <Input
            type="number"
            value={String(company.invoice_number_next)}
            onChange={(v) =>
              set("invoice_number_next", Math.max(1, parseInt(v) || 1))
            }
          />
        </Field>
        <Field label="Nummer padding">
          <Input
            type="number"
            value={String(company.invoice_number_padding)}
            onChange={(v) =>
              set("invoice_number_padding", Math.max(0, parseInt(v) || 0))
            }
          />
        </Field>
      </div>

      <div className="mt-4 p-3 bg-zinc-900/50 border border-[var(--border)] rounded-lg">
        <p className="text-xs text-zinc-500 mb-2">Logo</p>
        <div className="flex items-center gap-3 flex-wrap">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${company.name} logo`}
              className="max-h-16 max-w-[200px] bg-white rounded px-2 py-1 object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 text-xs text-zinc-500 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded">
              <ImageOff className="w-4 h-4" />
              Nog geen logo
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadLogo(file);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadingLogo}
            className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors disabled:opacity-40"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploadingLogo
              ? "Uploaden..."
              : company.logo_path
                ? "Vervangen"
                : "Uploaden"}
          </button>
          {company.logo_path && (
            <button
              onClick={onRemoveLogo}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Verwijderen
            </button>
          )}
          <span className="text-[10px] text-zinc-600">
            PNG / JPG / GIF · max 2 MB
          </span>
        </div>
      </div>

      <Field label="Standaard betalingsvoorwaarden (tekst op factuur)">
        <textarea
          value={company.default_terms_text || ""}
          onChange={(e) => set("default_terms_text", e.target.value || null)}
          rows={2}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </Field>

      <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
        <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          E-mail verzending
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Verzend-adres (from)">
            <input
              type="email"
              placeholder={`bv. facturen@${(company.website || company.name).toString().toLowerCase().replace(/[^a-z0-9]+/g, "")}.nl`}
              value={company.sender_email || ""}
              onChange={(e) =>
                set("sender_email", e.target.value || null)
              }
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>
          <Field label="Reply-to adres (optioneel)">
            <input
              type="email"
              value={company.reply_to_email || ""}
              onChange={(e) =>
                set("reply_to_email", e.target.value || null)
              }
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-600">
          Het verzend-adres moet gevalideerd zijn in Postmark als Sender
          Signature of onder een geverifieerd Domain. Onderwerp- en bodytemplates
          (NL + EN) zijn ook aanpasbaar maar hebben sensible defaults — laat
          leeg om de default te gebruiken.
        </p>
        <details className="bg-zinc-900/50 border border-[var(--border)] rounded-lg p-3">
          <summary className="text-xs text-zinc-400 cursor-pointer">
            Onderwerp- en bodytemplates aanpassen
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Onderwerp (NL)">
              <input
                type="text"
                placeholder="Factuur {{invoice_number}} — {{company_name}}"
                value={company.email_subject_nl || ""}
                onChange={(e) =>
                  set("email_subject_nl", e.target.value || null)
                }
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </Field>
            <Field label="Body (NL)">
              <textarea
                value={company.email_body_nl || ""}
                placeholder="Beste {{client_name}}, bijgevoegd factuur {{invoice_number}}..."
                onChange={(e) =>
                  set("email_body_nl", e.target.value || null)
                }
                rows={4}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
              />
            </Field>
            <Field label="Onderwerp (EN)">
              <input
                type="text"
                placeholder="Invoice {{invoice_number}} — {{company_name}}"
                value={company.email_subject_en || ""}
                onChange={(e) =>
                  set("email_subject_en", e.target.value || null)
                }
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </Field>
            <Field label="Body (EN)">
              <textarea
                value={company.email_body_en || ""}
                onChange={(e) =>
                  set("email_body_en", e.target.value || null)
                }
                rows={4}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
              />
            </Field>
            <p className="text-[10px] text-zinc-600">
              Placeholders: {"{{client_name}}"} · {"{{company_name}}"} ·{" "}
              {"{{invoice_number}}"} · {"{{total}}"} · {"{{due_date}}"} ·{" "}
              {"{{issue_date}}"} · {"{{reference}}"}
            </p>
          </div>
        </details>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
        <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Offerte-herinneringen
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Reminder X dagen na verzenden (0 = uit)">
            <input
              type="number"
              min={0}
              value={company.reminder_days_after_send}
              onChange={(e) =>
                set(
                  "reminder_days_after_send",
                  Math.max(0, parseInt(e.target.value) || 0),
                )
              }
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>
          <Field label="Verloop-waarschuwing Y dagen vóór einde (0 = uit)">
            <input
              type="number"
              min={0}
              value={company.reminder_days_before_expiry}
              onChange={(e) =>
                set(
                  "reminder_days_before_expiry",
                  Math.max(0, parseInt(e.target.value) || 0),
                )
              }
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-600">
          Elke offerte krijgt max 1× een reminder en 1× een verloop-
          waarschuwing. Templates zijn aanpasbaar hieronder — laat leeg voor
          sensible defaults.
        </p>
        <details className="bg-zinc-900/50 border border-[var(--border)] rounded-lg p-3">
          <summary className="text-xs text-zinc-400 cursor-pointer">
            Reminder-template aanpassen
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Reminder onderwerp (NL)">
              <input
                type="text"
                value={company.reminder_subject_nl || ""}
                onChange={(e) =>
                  set("reminder_subject_nl", e.target.value || null)
                }
                placeholder="Herinnering — offerte {{quote_number}}"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Reminder body (NL)">
              <textarea
                value={company.reminder_body_nl || ""}
                onChange={(e) =>
                  set("reminder_body_nl", e.target.value || null)
                }
                rows={4}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
              />
            </Field>
            <Field label="Verloop-waarschuwing onderwerp (NL)">
              <input
                type="text"
                value={company.expiry_subject_nl || ""}
                onChange={(e) =>
                  set("expiry_subject_nl", e.target.value || null)
                }
                placeholder="Offerte {{quote_number}} verloopt binnenkort"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Verloop-waarschuwing body (NL)">
              <textarea
                value={company.expiry_body_nl || ""}
                onChange={(e) =>
                  set("expiry_body_nl", e.target.value || null)
                }
                rows={4}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
              />
            </Field>
            <p className="text-[10px] text-zinc-600">
              Placeholders: {"{{client_name}}"} · {"{{quote_number}}"} ·{" "}
              {"{{total}}"} · {"{{valid_until}}"} · {"{{sent_date}}"} ·{" "}
              {"{{accept_url}}"} · {"{{company_name}}"}
            </p>
            <p className="text-[10px] text-zinc-600">
              EN-varianten worden automatisch gebruikt voor Engelstalige
              offertes — vul indien nodig aan.
            </p>
          </div>
        </details>

        <details className="bg-zinc-900/50 border border-[var(--border)] rounded-lg p-3">
          <summary className="text-xs text-zinc-400 cursor-pointer">
            Offerte-verzending templates (klant)
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Onderwerp (NL)">
              <input
                type="text"
                value={company.quote_email_subject_nl || ""}
                onChange={(e) =>
                  set("quote_email_subject_nl", e.target.value || null)
                }
                placeholder="Offerte {{quote_number}} — {{company_name}}"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Body (NL)">
              <textarea
                value={company.quote_email_body_nl || ""}
                onChange={(e) =>
                  set("quote_email_body_nl", e.target.value || null)
                }
                rows={5}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
                placeholder="Beste {{client_name}}, ..."
              />
            </Field>
            <Field label="Onderwerp (EN)">
              <input
                type="text"
                value={company.quote_email_subject_en || ""}
                onChange={(e) =>
                  set("quote_email_subject_en", e.target.value || null)
                }
                placeholder="Quote {{quote_number}} — {{company_name}}"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Body (EN)">
              <textarea
                value={company.quote_email_body_en || ""}
                onChange={(e) =>
                  set("quote_email_body_en", e.target.value || null)
                }
                rows={5}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
                placeholder="Dear {{client_name}}, ..."
              />
            </Field>
            <p className="text-[10px] text-zinc-600">
              Placeholders: {"{{client_name}}"} · {"{{company_name}}"} ·{" "}
              {"{{quote_number}}"} · {"{{total}}"} · {"{{valid_until}}"} ·{" "}
              {"{{issue_date}}"} · {"{{accept_url}}"}
            </p>
          </div>
        </details>

        <details className="bg-zinc-900/50 border border-[var(--border)] rounded-lg p-3">
          <summary className="text-xs text-zinc-400 cursor-pointer">
            Eigenaar-notificatie (naar jou, bij accept/afwijzing offerte)
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Onderwerp bij acceptatie">
              <input
                type="text"
                value={company.owner_notify_accepted_subject || ""}
                onChange={(e) =>
                  set(
                    "owner_notify_accepted_subject",
                    e.target.value || null,
                  )
                }
                placeholder="✅ Offerte {{quote_number}} geaccepteerd door {{client_name}}"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Body bij acceptatie">
              <textarea
                value={company.owner_notify_accepted_body || ""}
                onChange={(e) =>
                  set("owner_notify_accepted_body", e.target.value || null)
                }
                rows={5}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
              />
            </Field>
            <Field label="Onderwerp bij afwijzing">
              <input
                type="text"
                value={company.owner_notify_rejected_subject || ""}
                onChange={(e) =>
                  set(
                    "owner_notify_rejected_subject",
                    e.target.value || null,
                  )
                }
                placeholder="❌ Offerte {{quote_number}} afgewezen door {{client_name}}"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Body bij afwijzing">
              <textarea
                value={company.owner_notify_rejected_body || ""}
                onChange={(e) =>
                  set("owner_notify_rejected_body", e.target.value || null)
                }
                rows={5}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
              />
            </Field>
            <p className="text-[10px] text-zinc-600">
              Placeholders: {"{{client_name}}"} · {"{{company_name}}"} ·{" "}
              {"{{quote_number}}"} · {"{{total}}"} · {"{{accepted_by}}"} ·{" "}
              {"{{rejected_by}}"} · {"{{reason}}"} · {"{{admin_url}}"}
            </p>
          </div>
        </details>

        <details className="bg-zinc-900/50 border border-[var(--border)] rounded-lg p-3">
          <summary className="text-xs text-zinc-400 cursor-pointer">
            Factuur-herinneringen (automatisch na vervaldatum)
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Dagen na vervaldatum tot 1e herinnering">
                <input
                  type="number"
                  min={0}
                  value={company.invoice_reminder_days_after_due}
                  onChange={(e) =>
                    set(
                      "invoice_reminder_days_after_due",
                      Math.max(0, parseInt(e.target.value) || 0),
                    )
                  }
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
                />
              </Field>
              <Field label="Dagen tussen herhalende herinneringen">
                <input
                  type="number"
                  min={0}
                  value={company.invoice_reminder_repeat_days}
                  onChange={(e) =>
                    set(
                      "invoice_reminder_repeat_days",
                      Math.max(0, parseInt(e.target.value) || 0),
                    )
                  }
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
                />
              </Field>
              <Field label="Max aantal herinneringen (0 = uit)">
                <input
                  type="number"
                  min={0}
                  value={company.invoice_reminder_max}
                  onChange={(e) =>
                    set(
                      "invoice_reminder_max",
                      Math.max(0, parseInt(e.target.value) || 0),
                    )
                  }
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
                />
              </Field>
            </div>
            <p className="text-[11px] text-zinc-500">
              Voorbeeld: 3 / 14 / 2 = eerste herinnering 3 dagen na
              vervaldatum, tweede 14 dagen later, daarna geen meer.
            </p>
            <Field label="Onderwerp (NL)">
              <input
                type="text"
                value={company.invoice_reminder_subject_nl || ""}
                onChange={(e) =>
                  set(
                    "invoice_reminder_subject_nl",
                    e.target.value || null,
                  )
                }
                placeholder="Herinnering — factuur {{invoice_number}} ({{days_overdue}} dagen over)"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Body (NL)">
              <textarea
                value={company.invoice_reminder_body_nl || ""}
                onChange={(e) =>
                  set("invoice_reminder_body_nl", e.target.value || null)
                }
                rows={5}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
              />
            </Field>
            <Field label="Onderwerp (EN)">
              <input
                type="text"
                value={company.invoice_reminder_subject_en || ""}
                onChange={(e) =>
                  set(
                    "invoice_reminder_subject_en",
                    e.target.value || null,
                  )
                }
                placeholder="Reminder — invoice {{invoice_number}} ({{days_overdue}} days overdue)"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
              />
            </Field>
            <Field label="Body (EN)">
              <textarea
                value={company.invoice_reminder_body_en || ""}
                onChange={(e) =>
                  set("invoice_reminder_body_en", e.target.value || null)
                }
                rows={5}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs font-mono text-zinc-200"
              />
            </Field>
            <p className="text-[10px] text-zinc-600">
              Placeholders: {"{{client_name}}"} · {"{{company_name}}"} ·{" "}
              {"{{invoice_number}}"} · {"{{total}}"} · {"{{due_date}}"} ·{" "}
              {"{{days_overdue}}"} · {"{{view_url}}"} · {"{{pay_link}}"}
            </p>
          </div>
        </details>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
        >
          <Check className="w-4 h-4" />
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-400">Opgeslagen</span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </section>
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

function Input(props: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={props.type || "text"}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  );
}
