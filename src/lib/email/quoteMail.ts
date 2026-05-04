import crypto from "crypto";
import { ServerClient, Models } from "postmark";
import { getEmailSettings } from "@/lib/settings";
import { getQuoteWithLines, getQuoteRenderContext } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/pdf/renderQuote";
import { getDb } from "@/lib/db";
import { formatEUR, formatDate } from "@/lib/format";
import { log } from "@/lib/logger";
import { getAccountingBaseUrl } from "@/lib/branding";

type Lang = "nl" | "en";

const DEFAULT_SUBJECT: Record<Lang, string> = {
  nl: "Offerte {{quote_number}} — {{company_name}}",
  en: "Quote {{quote_number}} — {{company_name}}",
};

const DEFAULT_BODY: Record<Lang, string> = {
  nl: `Beste {{client_name}},

Bijgevoegd vind je offerte {{quote_number}} voor een bedrag van {{total}}.

Je kunt de offerte online bekijken en direct accepteren via deze link:
{{accept_url}}

De offerte is geldig tot {{valid_until}}.

Met vriendelijke groet,
{{company_name}}`,
  en: `Dear {{client_name}},

Please find attached quote {{quote_number}} for an amount of {{total}}.

You can review and accept the quote online via this link:
{{accept_url}}

The quote is valid until {{valid_until}}.

Kind regards,
{{company_name}}`,
};

export async function sendQuoteByEmail(
  quoteId: string,
  override?: { to?: string; cc?: string },
): Promise<{ message_id: string }> {
  const settings = getEmailSettings();
  if (!settings.postmark_server_token) {
    throw new Error(
      "Postmark API token ontbreekt. Vul hem in bij Instellingen → E-mail.",
    );
  }

  const quote = getQuoteWithLines(quoteId);
  if (!quote) throw new Error("Offerte bestaat niet");
  if (quote.status === "draft") {
    throw new Error("Concept kan niet verstuurd worden — finaliseer eerst");
  }

  const { company, client } = getQuoteRenderContext(quote);

  if (!company.sender_email) {
    throw new Error(
      `Geen sender-adres ingesteld voor ${company.name}. Vul het in bij het bedrijf.`,
    );
  }
  const to = override?.to || client.email;
  if (!to) {
    throw new Error("Klant heeft geen e-mailadres en er is geen override");
  }

  const lang: Lang = quote.language === "en" ? "en" : "nl";
  const subjectTmpl =
    (lang === "en"
      ? company.quote_email_subject_en
      : company.quote_email_subject_nl) || DEFAULT_SUBJECT[lang];
  const bodyTmpl =
    (lang === "en"
      ? company.quote_email_body_en
      : company.quote_email_body_nl) || DEFAULT_BODY[lang];

  const baseUrl = getAccountingBaseUrl();
  const acceptUrl = quote.public_token
    ? `${baseUrl}/quote-accept/${quote.public_token}`
    : "";

  const vars: Record<string, string> = {
    client_name: client.name,
    company_name: company.name,
    quote_number: quote.number,
    total: formatEUR(quote.total_cents),
    valid_until: formatDate(quote.valid_until_date, lang),
    issue_date: formatDate(quote.issue_date, lang),
    accept_url: acceptUrl,
  };
  const subject = substitute(subjectTmpl, vars);
  const text = substitute(bodyTmpl, vars);
  const html = textToHtml(text, company.accent_color || "#6366f1");

  const pdfBuffer = await renderQuotePdf(quoteId);
  const filename = `${quote.number}.pdf`;

  if (settings.test_mode) {
    log.info(
      { scope: "accounting/quote-email", to, subject, test_mode: true },
      "test mode — quote email not actually sent",
    );
    const fakeId = `test-${crypto.randomUUID()}`;
    persistSent(quoteId, fakeId);
    return { message_id: fakeId };
  }

  const pm = new ServerClient(settings.postmark_server_token);
  try {
    const res = await pm.sendEmail({
      From: `${company.name} <${company.sender_email}>`,
      To: to,
      Cc: override?.cc,
      ReplyTo: company.reply_to_email || undefined,
      Subject: subject,
      HtmlBody: html,
      TextBody: text,
      MessageStream: "outbound",
      TrackOpens: true,
      TrackLinks: Models.LinkTrackingOptions.HtmlOnly,
      Metadata: { type: "quote", quote_id: quoteId },
      Attachments: [
        {
          Name: filename,
          Content: pdfBuffer.toString("base64"),
          ContentType: "application/pdf",
          ContentID: "",
        },
      ],
    });
    persistSent(quoteId, res.MessageID);
    return { message_id: res.MessageID };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logQuoteEvent(quoteId, "email_failed", { error: msg, to });
    throw new Error(`Postmark: ${msg}`);
  }
}

function persistSent(quoteId: string, messageId: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `UPDATE quotes SET postmark_message_id = ?, emailed_at = ?, updated_at = ? WHERE id = ?`,
  ).run(messageId, now, now, quoteId);
  logQuoteEvent(quoteId, "emailed", { message_id: messageId });
}

/**
 * Stuurt een notificatie naar de eigenaar (company.sender_email) wanneer een
 * klant de offerte via de publieke link heeft geaccepteerd of afgewezen.
 * Faalt zacht — als Postmark niet geconfigureerd is, alleen loggen.
 */
export async function notifyQuoteAccepted(quoteId: string): Promise<void> {
  await notifyOwner(quoteId, "accepted");
}

export async function notifyQuoteRejected(quoteId: string): Promise<void> {
  await notifyOwner(quoteId, "rejected");
}

async function notifyOwner(
  quoteId: string,
  kind: "accepted" | "rejected",
): Promise<void> {
  const settings = getEmailSettings();
  const quote = getQuoteWithLines(quoteId);
  if (!quote) return;
  const { company, client } = getQuoteRenderContext(quote);
  if (!company.sender_email) {
    log.warn(
      { scope: "accounting/quote-notify", quote_id: quoteId },
      "no sender_email — skipping owner notification",
    );
    return;
  }
  if (!settings.postmark_server_token || settings.test_mode) {
    log.info(
      {
        scope: "accounting/quote-notify",
        quote_id: quoteId,
        kind,
        test_mode: settings.test_mode,
      },
      "owner notification skipped (no token or test mode)",
    );
    return;
  }

  const baseUrl = getAccountingBaseUrl();
  const quoteUrl = `${baseUrl}/accounting/quotes/${quote.id}`;
  const amount = formatEUR(quote.total_cents);

  const defaultAcceptedSubject = `✅ Offerte {{quote_number}} geaccepteerd door {{client_name}}`;
  const defaultRejectedSubject = `❌ Offerte {{quote_number}} afgewezen door {{client_name}}`;
  const defaultAcceptedBody = [
    `{{client_name}} heeft offerte {{quote_number}} geaccepteerd.`,
    ``,
    `Geaccepteerd door: {{accepted_by}}`,
    `Bedrag: {{total}}`,
    ``,
    `Bekijk in de admin:`,
    `{{admin_url}}`,
  ].join("\n");
  const defaultRejectedBody = [
    `{{client_name}} heeft offerte {{quote_number}} afgewezen.`,
    ``,
    `Afgewezen door: {{rejected_by}}`,
    `Reden: {{reason}}`,
    `Bedrag was: {{total}}`,
    ``,
    `Bekijk in de admin:`,
    `{{admin_url}}`,
  ].join("\n");

  const subjectTmpl =
    kind === "accepted"
      ? company.owner_notify_accepted_subject || defaultAcceptedSubject
      : company.owner_notify_rejected_subject || defaultRejectedSubject;
  const bodyTmpl =
    kind === "accepted"
      ? company.owner_notify_accepted_body || defaultAcceptedBody
      : company.owner_notify_rejected_body || defaultRejectedBody;

  const vars: Record<string, string> = {
    client_name: client.name,
    company_name: company.name,
    quote_number: quote.number,
    total: amount,
    admin_url: quoteUrl,
    accepted_by: quote.accepted_by_name || "(naam niet geregistreerd)",
    rejected_by: quote.rejected_by_name || "(naam niet geregistreerd)",
    reason: quote.rejected_reason || "(geen opgegeven)",
  };

  const substitute = (t: string) =>
    t.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
  const subject = substitute(subjectTmpl);
  const textBody = substitute(bodyTmpl);
  const htmlBody = textBody
    .replace(/\n/g, "<br/>")
    .replace(
      quoteUrl,
      `<a href="${quoteUrl}" style="color:${company.accent_color || "#6366f1"}">${quoteUrl}</a>`,
    );

  try {
    const pm = new ServerClient(settings.postmark_server_token);
    const res = await pm.sendEmail({
      From: `Nova Accounting <${company.sender_email}>`,
      To: company.sender_email,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: `<pre style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap;">${htmlBody}</pre>`,
      MessageStream: "outbound",
    });
    log.info(
      {
        scope: "accounting/quote-notify",
        quote_id: quoteId,
        kind,
        message_id: res.MessageID,
      },
      "owner notified",
    );
  } catch (err) {
    log.error(
      {
        scope: "accounting/quote-notify",
        quote_id: quoteId,
        err: err instanceof Error ? err.message : String(err),
      },
      "owner notification send failed",
    );
  }
}

function logQuoteEvent(quoteId: string, type: string, payload: unknown) {
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
