import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMollieSettings } from "@/lib/mollie";
import MollieSettingsForm from "./MollieSettingsForm";

export const dynamic = "force-dynamic";

function mask(t: string): string {
  if (!t) return "";
  if (t.length <= 8) return "•".repeat(t.length);
  return `${t.slice(0, 5)}${"•".repeat(t.length - 9)}${t.slice(-4)}`;
}

export default function MollieSettingsPage() {
  const s = getMollieSettings();
  const keyType: "live" | "test" | "unknown" = s.api_key.startsWith("live_")
    ? "live"
    : s.api_key.startsWith("test_")
      ? "test"
      : "unknown";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <Link
          href="/settings"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Instellingen
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Mollie</h1>
        <p className="text-sm text-zinc-500 mt-1">
          iDEAL-, Bancontact- en creditcard-betaallinks in facturen en
          offertes. Per factuur genereer je een link; de klant betaalt direct
          via Mollie&apos;s checkout en onze webhook markeert de factuur
          automatisch als betaald.
        </p>
      </header>

      <MollieSettingsForm
        initialHasKey={!!s.api_key}
        initialKeyPreview={s.api_key ? mask(s.api_key) : ""}
        initialKeyType={keyType}
        initialDescriptionTemplate={s.description_template}
      />

      <section className="bg-zinc-900/30 border border-[var(--border)] rounded-xl p-5 text-xs text-zinc-400 space-y-2">
        <p className="font-semibold text-zinc-300">Setup-checklist</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>
            Account op{" "}
            <a
              href="https://mollie.com/signup"
              className="text-emerald-400 hover:text-emerald-300"
              target="_blank"
              rel="noreferrer"
            >
              mollie.com
            </a>{" "}
            aanmaken (gratis, geen maandkosten).
          </li>
          <li>
            Onboarding afronden (KvK, IBAN, identiteit). Mollie schakelt
            iDEAL vrij na 1-2 dagen.
          </li>
          <li>
            Ga naar <b>Dashboard → Ontwikkelaars → API-keys</b> en kopieer
            de <b>Live API key</b> (<code>live_...</code>). Gebruik de
            <b> Test API key</b> (<code>test_...</code>) voor testen zonder
            echte transacties.
          </li>
          <li>
            Plak de key hierboven en klik Opslaan.
          </li>
          <li>
            Webhook-URL is al voorgeconfigureerd:{" "}
            <code className="font-mono text-zinc-300">
              https://accounting.novactrl.nl/api/mollie/webhook
            </code>
            . Mollie gebruikt deze automatisch bij elke betaling — geen
            handmatige registratie nodig.
          </li>
        </ol>
      </section>
    </div>
  );
}
