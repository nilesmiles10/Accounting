import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  AlertOctagon,
  BellRing,
  BellOff,
  AlertTriangle,
} from "lucide-react";
import { listMailLog, type MailLogEntry } from "@/lib/email/mailLog";
import { listCompanies } from "@/lib/companies";

export const dynamic = "force-dynamic";

const EVENT_META: Record<
  string,
  { label: string; cls: string; Icon: typeof Mail }
> = {
  emailed: {
    label: "Verstuurd",
    cls: "bg-indigo-500/15 text-indigo-200",
    Icon: Mail,
  },
  sent_email: {
    label: "Verstuurd",
    cls: "bg-indigo-500/15 text-indigo-200",
    Icon: Mail,
  },
  reminder_sent: {
    label: "Herinnering",
    cls: "bg-amber-500/15 text-amber-200",
    Icon: BellRing,
  },
  expiry_reminder_sent: {
    label: "Verloop-reminder",
    cls: "bg-amber-500/15 text-amber-200",
    Icon: BellRing,
  },
  bounced: {
    label: "Bounce",
    cls: "bg-red-500/15 text-red-300",
    Icon: AlertOctagon,
  },
  spam_complaint: {
    label: "Spam-klacht",
    cls: "bg-red-500/15 text-red-300",
    Icon: AlertTriangle,
  },
  reminders_paused: {
    label: "Herinneringen uit",
    cls: "bg-zinc-700/40 text-zinc-300",
    Icon: BellOff,
  },
  reminders_resumed: {
    label: "Herinneringen aan",
    cls: "bg-emerald-500/15 text-emerald-200",
    Icon: BellRing,
  },
};

export default function MailLogPage({
  searchParams,
}: {
  searchParams: { type?: string; event?: string };
}) {
  const sourceType =
    searchParams.type === "invoice"
      ? ("invoice" as const)
      : searchParams.type === "quote"
        ? ("quote" as const)
        : undefined;
  const eventFilter = searchParams.event
    ? searchParams.event.split(",")
    : undefined;

  const entries = listMailLog({
    source_type: sourceType,
    event_types: eventFilter,
    limit: 300,
  });

  const companies = listCompanies();
  const companyById = new Map(companies.map((c) => [c.id, c.name]));

  // Stats per type voor de filter-knoppen
  const counts = {
    emailed: 0,
    reminder_sent: 0,
    bounced: 0,
    spam_complaint: 0,
  };
  for (const e of entries) {
    if (e.event_type === "emailed" || e.event_type === "sent_email")
      counts.emailed++;
    if (
      e.event_type === "reminder_sent" ||
      e.event_type === "expiry_reminder_sent"
    )
      counts.reminder_sent++;
    if (e.event_type === "bounced") counts.bounced++;
    if (e.event_type === "spam_complaint") counts.spam_complaint++;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Overzicht
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          E-mail historie
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Alle verstuurde e-mails, herinneringen, bounces en spam-klachten
          van facturen en offertes. Nieuwste bovenaan.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        <FilterChip
          href="/mail-log"
          active={!sourceType && !eventFilter}
          label="Alles"
          count={entries.length}
        />
        <FilterChip
          href="/mail-log?type=invoice"
          active={sourceType === "invoice"}
          label="Facturen"
        />
        <FilterChip
          href="/mail-log?type=quote"
          active={sourceType === "quote"}
          label="Offertes"
        />
        <div className="w-px h-6 bg-zinc-700 mx-1" />
        <FilterChip
          href="/mail-log?event=emailed,sent_email"
          active={eventFilter?.[0] === "emailed"}
          label={`Verstuurd (${counts.emailed})`}
          cls="text-indigo-300"
        />
        <FilterChip
          href="/mail-log?event=reminder_sent,expiry_reminder_sent"
          active={eventFilter?.[0] === "reminder_sent"}
          label={`Herinneringen (${counts.reminder_sent})`}
          cls="text-amber-300"
        />
        <FilterChip
          href="/mail-log?event=bounced,spam_complaint"
          active={eventFilter?.[0] === "bounced"}
          label={`Problemen (${counts.bounced + counts.spam_complaint})`}
          cls="text-red-300"
        />
      </div>

      {entries.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center text-sm text-zinc-500">
          Geen e-mails in de log met deze filter.
        </div>
      ) : (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-36">
                  Wanneer
                </th>
                <th className="text-left px-3 py-2 font-medium w-32">Type</th>
                <th className="text-left px-3 py-2 font-medium">Document</th>
                <th className="text-left px-3 py-2 font-medium">Ontvanger</th>
                <th className="text-left px-3 py-2 font-medium w-32">Bedrijf</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Row
                  key={e.id}
                  entry={e}
                  companyName={
                    e.source_company_id
                      ? (companyById.get(e.source_company_id) ?? null)
                      : null
                  }
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Tip: bounce of spam-klacht? Klant heeft de mail niet ontvangen —
        controleer het e-mailadres en stuur opnieuw. Auto-herinneringen
        worden NIET geblokkeerd door eerdere bounces.
      </p>
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
  cls,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  cls?: string;
}) {
  return (
    <Link
      href={href}
      className={`px-2.5 py-1 rounded-full border ${
        active
          ? "bg-zinc-700 border-zinc-600 text-zinc-100"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
      } ${cls ?? ""}`}
    >
      {label}
      {count !== undefined && active ? ` (${count})` : ""}
    </Link>
  );
}

function Row({
  entry,
  companyName,
}: {
  entry: MailLogEntry;
  companyName: string | null;
}) {
  const meta = EVENT_META[entry.event_type] ?? {
    label: entry.event_type,
    cls: "bg-zinc-700 text-zinc-300",
    Icon: Mail,
  };
  const Icon = meta.Icon;
  const d = new Date(entry.created_at);
  const docHref =
    entry.source_type === "invoice"
      ? `/invoices/${entry.source_id}`
      : `/quotes/${entry.source_id}`;

  return (
    <tr className="border-t border-[var(--border)] hover:bg-zinc-900/30">
      <td className="px-3 py-2 text-zinc-400 text-xs">
        {d.toLocaleDateString("nl-NL")}{" "}
        <span className="text-zinc-600">
          {d.toLocaleTimeString("nl-NL", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded ${meta.cls}`}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-2 text-zinc-200">
        <Link
          href={docHref}
          className="font-mono hover:text-emerald-300"
        >
          {entry.source_number || entry.source_id.slice(0, 8)}
        </Link>
        <span className="text-zinc-600 text-[11px] ml-1.5">
          {entry.source_type === "invoice" ? "factuur" : "offerte"}
        </span>
        {entry.event_type === "reminder_sent" &&
          typeof entry.payload.days_overdue === "number" && (
            <span className="text-amber-400 text-[11px] ml-2">
              +{String(entry.payload.days_overdue)} dgn
            </span>
          )}
        {(entry.event_type === "bounced" ||
          entry.event_type === "spam_complaint") &&
          typeof entry.payload.description === "string" && (
            <p className="text-[11px] text-red-300 mt-0.5">
              {String(entry.payload.description).slice(0, 120)}
            </p>
          )}
      </td>
      <td className="px-3 py-2 text-zinc-300">
        {entry.recipient_name || "—"}
        {entry.recipient_email && (
          <p className="text-[11px] text-zinc-500">{entry.recipient_email}</p>
        )}
      </td>
      <td className="px-3 py-2 text-zinc-400 text-xs">
        {companyName || "—"}
      </td>
    </tr>
  );
}
