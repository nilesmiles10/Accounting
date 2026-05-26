import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getEmailSettings } from "@/lib/settings";
import EmailSettingsForm from "./EmailSettingsForm";

export const dynamic = "force-dynamic";

export default function EmailSettingsPage() {
  const settings = getEmailSettings();
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
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">E-mail</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Postmark wordt gebruikt om facturen per mail te versturen. Vul
          hier het{" "}
          <span className="font-mono text-zinc-300">Server API Token</span>{" "}
          in (niet het account-token).
        </p>
      </header>

      <EmailSettingsForm
        initialHasToken={!!settings.postmark_server_token}
        initialTokenPreview={
          settings.postmark_server_token
            ? maskToken(settings.postmark_server_token)
            : ""
        }
        initialTestMode={settings.test_mode}
        initialAutoRemindersDisabled={
          settings.auto_reminders_disabled === true
        }
      />

      <section className="bg-zinc-900/30 border border-[var(--border)] rounded-xl p-5 text-xs text-zinc-400 space-y-2">
        <p className="font-semibold text-zinc-300">Nog te regelen bij Postmark</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>
            <b>Sender Signature</b> of <b>Domain</b> aanmaken voor het
            verzendadres van elk bedrijf (bv. facturen@intersumma.nl). Je
            kunt het sender-adres per bedrijf instellen bij Bedrijven.
          </li>
          <li>
            Bij gebruik van een domain: voeg de DKIM- en Return-Path
            DNS-records toe zoals Postmark ze toont, anders worden mails
            als spam gemarkeerd.
          </li>
          <li>
            Testmode aanzetten tijdens setup — dan wordt er niet echt
            verstuurd maar enkel gelogd.
          </li>
        </ol>
      </section>
    </div>
  );
}

function maskToken(t: string): string {
  if (t.length <= 8) return "•".repeat(t.length);
  return `${"•".repeat(Math.max(0, t.length - 4))}${t.slice(-4)}`;
}
