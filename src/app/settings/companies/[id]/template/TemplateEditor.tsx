"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { Company, CompanyUpdate } from "@/lib/companies";
import LivePreview from "@/app/invoices/LivePreview";
import { mockInvoice, mockClient } from "@/lib/pdf/mockInvoice";

export default function TemplateEditor({ company }: { company: Company }) {
  const router = useRouter();
  const [previewLang, setPreviewLang] = useState<"nl" | "en">(
    company.default_language,
  );
  const [settings, setSettings] = useState({
    accent_color: company.accent_color,
    header_style: company.header_style,
    font_family: company.font_family,
    table_header_style: company.table_header_style,
    logo_position: company.logo_position,
    logo_max_height: company.logo_max_height,
    footer_text: company.footer_text || "",
    show_footer_auto: company.show_footer_auto,
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!company.logo_path) {
      setLogoDataUrl(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/companies/${company.id}/logo`)
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            if (!blob) return resolve(null);
            const fr = new FileReader();
            fr.onloadend = () => resolve(fr.result as string);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(blob);
          }),
      )
      .then((u) => {
        if (!cancelled) setLogoDataUrl(u);
      });
    return () => {
      cancelled = true;
    };
  }, [company.id, company.logo_path]);

  const previewCompany: Company = {
    ...company,
    ...settings,
    footer_text: settings.footer_text || null,
  };

  function set<K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K],
  ) {
    setSettings((s) => ({ ...s, [key]: value }));
    setSavedAt(null);
  }

  async function onSave() {
    setError("");
    setSaving(true);
    const patch: CompanyUpdate = {
      accent_color: settings.accent_color,
      header_style: settings.header_style,
      font_family: settings.font_family,
      table_header_style: settings.table_header_style,
      logo_position: settings.logo_position,
      logo_max_height: settings.logo_max_height,
      footer_text: settings.footer_text || null,
      show_footer_auto: settings.show_footer_auto,
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
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
      {/* Controls */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4 self-start lg:sticky lg:top-4">
        <Block title="Kleuren">
          <Field label="Accentkleur">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.accent_color}
                onChange={(e) => set("accent_color", e.target.value)}
                className="w-10 h-9 rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
              />
              <input
                type="text"
                value={settings.accent_color}
                onChange={(e) => set("accent_color", e.target.value)}
                className="input flex-1"
              />
            </div>
          </Field>
        </Block>

        <Block title="Lettertype">
          <select
            value={settings.font_family}
            onChange={(e) =>
              set(
                "font_family",
                e.target.value as typeof settings.font_family,
              )
            }
            className="select"
          >
            <option value="Helvetica">Helvetica (modern)</option>
            <option value="Times-Roman">Times (klassiek serif)</option>
            <option value="Courier">Courier (monospace)</option>
          </select>
        </Block>

        <Block title="Header">
          <Field label="Stijl">
            <select
              value={settings.header_style}
              onChange={(e) =>
                set(
                  "header_style",
                  e.target.value as typeof settings.header_style,
                )
              }
              className="select"
            >
              <option value="band">Balk onder header</option>
              <option value="minimal">Minimaal (geen balk)</option>
              <option value="logo_only">Alleen logo (geen titel)</option>
            </select>
          </Field>
          <Field label="Logo positie">
            <div className="flex gap-2">
              <Toggle
                active={settings.logo_position === "left"}
                onClick={() => set("logo_position", "left")}
                label="Links"
              />
              <Toggle
                active={settings.logo_position === "right"}
                onClick={() => set("logo_position", "right")}
                label="Rechts"
              />
            </div>
          </Field>
          <Field label={`Max hoogte logo: ${settings.logo_max_height}px`}>
            <input
              type="range"
              min={40}
              max={120}
              step={5}
              value={settings.logo_max_height}
              onChange={(e) =>
                set("logo_max_height", parseInt(e.target.value))
              }
              className="w-full"
            />
          </Field>
        </Block>

        <Block title="Regels-tabel">
          <Field label="Header-stijl">
            <select
              value={settings.table_header_style}
              onChange={(e) =>
                set(
                  "table_header_style",
                  e.target.value as typeof settings.table_header_style,
                )
              }
              className="select"
            >
              <option value="accent">Gekleurde balk (accent)</option>
              <option value="dark">Donkere balk</option>
              <option value="minimal">Minimaal (alleen lijn)</option>
            </select>
          </Field>
        </Block>

        <Block title="Footer">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={!!settings.show_footer_auto}
              onChange={(e) =>
                set("show_footer_auto", e.target.checked ? 1 : 0)
              }
            />
            Automatisch genereren uit KvK · BTW · IBAN
          </label>
          <Field label="Eigen footer-tekst (overschrijft auto)">
            <textarea
              value={settings.footer_text}
              onChange={(e) => set("footer_text", e.target.value)}
              rows={2}
              placeholder="Bv. Algemene voorwaarden op www.voorbeeld.nl"
              className="input"
            />
          </Field>
        </Block>

        <div className="flex items-center gap-3 pt-3 border-t border-[var(--border)]">
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
      </section>

      {/* Preview */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] text-zinc-500">Voorbeeld-factuur</p>
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={() => setPreviewLang("nl")}
              className={`px-2 py-0.5 rounded ${
                previewLang === "nl"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              NL
            </button>
            <button
              onClick={() => setPreviewLang("en")}
              className={`px-2 py-0.5 rounded ${
                previewLang === "en"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              EN
            </button>
          </div>
        </div>
        <LivePreview
          invoice={mockInvoice(company.id, previewLang)}
          company={previewCompany}
          client={mockClient()}
          logoDataUrl={logoDataUrl}
        />
      </section>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
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
      <span className="block text-[11px] text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors ${
        active
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
          : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
