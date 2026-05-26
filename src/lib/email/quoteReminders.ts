import crypto from "crypto";
import { ServerClient, Models } from "postmark";
import { getEmailSettings } from "@/lib/settings";
import {
  getQuoteRenderContext,
  getQuoteWithLines,
} from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/pdf/renderQuote";
import { getDb } from "@/lib/db";
import { formatEUR, formatDate } from "@/lib/format";
import { log } from "@/lib/logger";
import { getAccountingBaseUrl } from "@/lib/branding";

type Lang = "nl" | "en";

const DEFAULT_REMINDER_SUBJECT: Record<Lang, string> = {
  nl: "Herinnering — offerte {{quote_number}}",
  en: "Reminder — quote {{quote_number}}",
};
const DEFAULT_REMINDER_BODY: Record<Lang, string> = {
  nl: `Beste {{client_name}},

Een vriendelijke herinnering aan offerte {{quote_number}} ({{total}}) die we op {{sent_date}} hebben verzonden. We hebben nog geen reactie ontvangen.

Je kunt de offerte nog steeds online bekijken en accepteren:
{{accept_url}}

De offerte is geldig tot {{valid_until}}. Laat ons weten als je vragen hebt.

Met vriendelijke groet,
{{company_name}}`,
  en: `Dear {{client_name}},

A friendly reminder about quote {{quote_number}} ({{total}}) we sent on {{sent_date}}. We haven't heard back yet.

You can still review and accept the quote online:
{{accept_url}}

The quote is valid until {{valid_until}}. Let us know if you have any questions.

Kind regards,
{{company_name}}`,
};

const DEFAULT_EXPIRY_SUBJECT: Record<Lang, string> = {
  nl: "Offerte {{quote_number}} verloopt binnenkort",
  en: "Quote {{quote_number}} expires soon",
};
const DEFAULT_EXPIRY_BODY: Record<Lang, string> = {
  nl: `Beste {{client_name}},

Je offerte {{quote_number}} verloopt binnenkort (op {{valid_until}}). Mocht je nog interesse hebben, laat het ons dan weten — eventueel kunnen we een aangepast voorstel maken.

Direct accepteren kan ook via:
{{accept_url}}

Met vriendelijke groet,
{{company_name}}`,
  en: `Dear {{client_name}},

Your quote {{quote_number}} is about to expire (on {{valid_until}}). If you're still interested, please let us know — we can also provide an updated proposal.

Accept directly via:
{{accept_url}}

Kind regards,
{{company_name}}`,
};

interface CandidateRow {
  id: string;
  company_id: string;
  sent_at: number;
  valid_until_date: string;
  reminder_sent_at: number | null;
  expiry_warning_sent_at: number | null;
  reminder_days_after_send: number;
  reminder_days_before_expiry: number;
}

/**
 * Scan alle 'sent' offertes en stuur reminder of expiry-warning als de
 * timing het toelaat en er nog niet één is verstuurd. Idempotent: elke
 * mailsoort max 1× per offerte, bewaakt door reminder_sent_at en
 * expiry_warning_sent_at kolommen.
 *
 * Returnt het aantal verstuurde mails per type.
 */
export async function runQuoteReminders(): Promise<{
  reminders: number;
  expiry_warnings: number;
  errors: number;
}> {
  const settings = getEmailSettings();
  if (!settings.postmark_server_token && !settings.test_mode) {
    log.warn(
      { scope: "accounting/quote-reminders" },
      "no Postmark token configured — skipping",
    );
    return { reminders: 0, expiry_warnings: 0, errors: 0 };
  }
  if (settings.auto_reminders_disabled) {
    return { reminders: 0, expiry_warnings: 0, errors: 0 };
  }

  const db = getDb();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT q.id, q.company_id, q.sent_at, q.valid_until_date,
              q.reminder_sent_at, q.expiry_warning_sent_at,
              c.reminder_days_after_send, c.reminder_days_before_expiry
         FROM quotes q
         JOIN companies c ON c.id = q.company_id
        WHERE q.status = 'sent' AND q.sent_at IS NOT NULL`,
    )
    .all() as CandidateRow[];

  let reminders = 0;
  let expiries = 0;
  let errors = 0;

  for (const row of rows) {
    // Reminder na X dagen zonder reactie
    if (
      row.reminder_days_after_send > 0 &&
      !row.reminder_sent_at &&
      now - row.sent_at >= row.reminder_days_after_send * 86400000
    ) {
      try {
        await sendReminder(row.id, "reminder");
        reminders++;
      } catch (err) {
        errors++;
        log.error(
          {
            scope: "accounting/quote-reminders",
            quote_id: row.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "reminder send failed",
        );
      }
    }

    // Expiry warning Y dagen voor valid_until
    if (row.reminder_days_before_expiry > 0 && !row.expiry_warning_sent_at) {
      const validDate = new Date(row.valid_until_date + "T00:00:00Z");
      const daysUntilExpiry = Math.floor(
        (validDate.getTime() - new Date(today + "T00:00:00Z").getTime()) /
          86400000,
      );
      if (
        daysUntilExpiry >= 0 &&
        daysUntilExpiry <= row.reminder_days_before_expiry
      ) {
        try {
          await sendReminder(row.id, "expiry");
          expiries++;
        } catch (err) {
          errors++;
          log.error(
            {
              scope: "accounting/quote-reminders",
              quote_id: row.id,
              err: err instanceof Error ? err.message : String(err),
            },
            "expiry warning send failed",
          );
        }
      }
    }
  }

  log.info(
    {
      scope: "accounting/quote-reminders",
      reminders,
      expiries,
      errors,
      total_candidates: rows.length,
    },
    "reminder run completed",
  );

  return { reminders, expiry_warnings: expiries, errors };
}

async function sendReminder(
  quoteId: string,
  kind: "reminder" | "expiry",
): Promise<void> {
  const settings = getEmailSettings();
  const quote = getQuoteWithLines(quoteId);
  if (!quote) throw new Error("Offerte bestaat niet");
  const { company, client } = getQuoteRenderContext(quote);

  if (!company.sender_email) {
    throw new Error("Geen sender-adres voor bedrijf");
  }
  if (!client.email) {
    throw new Error("Klant heeft geen e-mailadres");
  }

  const lang: Lang = quote.language === "en" ? "en" : "nl";
  const subjTmpl =
    kind === "reminder"
      ? (lang === "en"
          ? company.reminder_subject_en
          : company.reminder_subject_nl) || DEFAULT_REMINDER_SUBJECT[lang]
      : (lang === "en"
          ? company.expiry_subject_en
          : company.expiry_subject_nl) || DEFAULT_EXPIRY_SUBJECT[lang];
  const bodyTmpl =
    kind === "reminder"
      ? (lang === "en"
          ? company.reminder_body_en
          : company.reminder_body_nl) || DEFAULT_REMINDER_BODY[lang]
      : (lang === "en"
          ? company.expiry_body_en
          : company.expiry_body_nl) || DEFAULT_EXPIRY_BODY[lang];

  const baseUrl = getAccountingBaseUrl();
  const acceptUrl = quote.public_token
    ? `${baseUrl}/quote-accept/${quote.public_token}`
    : "";
  const sentDate = quote.sent_at
    ? new Date(quote.sent_at).toISOString().slice(0, 10)
    : quote.issue_date;

  const vars: Record<string, string> = {
    client_name: client.name,
    company_name: company.name,
    quote_number: quote.number,
    total: formatEUR(quote.total_cents),
    valid_until: formatDate(quote.valid_until_date, lang),
    sent_date: formatDate(sentDate, lang),
    accept_url: acceptUrl,
  };
  const subject = substitute(subjTmpl, vars);
  const text = substitute(bodyTmpl, vars);
  const html = textToHtml(text, company.accent_color || "#6366f1");

  const pdfBuffer = await renderQuotePdf(quoteId);
  const filename = `${quote.number}.pdf`;

  const db = getDb();
  const now = Date.now();
  const col = kind === "reminder" ? "reminder_sent_at" : "expiry_warning_sent_at";

  if (settings.test_mode) {
    log.info(
      { scope: "accounting/quote-reminders", quote_id: quoteId, kind, test_mode: true },
      "test mode — reminder not sent",
    );
    db.prepare(
      `UPDATE quotes SET ${col} = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, quoteId);
    logQuoteEvent(quoteId, kind === "reminder" ? "reminder_sent" : "expiry_warning_sent", {
      test_mode: true,
    });
    return;
  }

  const pm = new ServerClient(settings.postmark_server_token);
  const res = await pm.sendEmail({
    From: `${company.name} <${company.sender_email}>`,
    To: client.email,
    ReplyTo: company.reply_to_email || undefined,
    Subject: subject,
    HtmlBody: html,
    TextBody: text,
    MessageStream: "outbound",
    TrackOpens: true,
    TrackLinks: Models.LinkTrackingOptions.HtmlOnly,
    Metadata: { type: kind, quote_id: quoteId },
    Attachments: [
      {
        Name: filename,
        Content: pdfBuffer.toString("base64"),
        ContentType: "application/pdf",
        ContentID: "",
      },
    ],
  });

  db.prepare(
    `UPDATE quotes SET ${col} = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, quoteId);
  logQuoteEvent(
    quoteId,
    kind === "reminder" ? "reminder_sent" : "expiry_warning_sent",
    { message_id: res.MessageID },
  );
}

function substitute(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
}

function textToHtml(text: string, accent: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n\n+/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.5;">${p.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" style="width:100%;background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${accent};height:4px;"></td></tr>
        <tr><td style="padding:32px;font-size:14px;">${paragraphs}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function logQuoteEvent(
  quoteId: string,
  type: string,
  payload: unknown,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO quote_events (id, quote_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    quoteId,
    type,
    JSON.stringify(payload),
    Date.now(),
  );
}
