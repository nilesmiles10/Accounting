import crypto from "crypto";
import { ServerClient, Models } from "postmark";
import { getEmailSettings } from "@/lib/settings";
import {
  getInvoiceWithLines,
  getRenderContext,
  markOverdueInvoices,
} from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/pdf/render";
import { getDb } from "@/lib/db";
import { formatEUR, formatDate } from "@/lib/format";
import { log } from "@/lib/logger";
import { getAccountingBaseUrl } from "@/lib/branding";

type Lang = "nl" | "en";

const DEFAULT_SUBJECT: Record<Lang, string> = {
  nl: "Herinnering — factuur {{invoice_number}} ({{days_overdue}} dagen over)",
  en: "Reminder — invoice {{invoice_number}} ({{days_overdue}} days overdue)",
};

const DEFAULT_BODY: Record<Lang, string> = {
  nl: `Beste {{client_name}},

Een vriendelijke herinnering aan factuur {{invoice_number}} ({{total}}) met vervaldatum {{due_date}}. Deze staat nu {{days_overdue}} dagen open.

Je kunt de factuur online bekijken en direct betalen via:
{{view_url}}

Is de betaling al onderweg? Dan mag je deze mail negeren.

Met vriendelijke groet,
{{company_name}}`,
  en: `Dear {{client_name}},

A friendly reminder about invoice {{invoice_number}} ({{total}}) with due date {{due_date}}. It is now {{days_overdue}} days overdue.

You can view the invoice online and pay directly via:
{{view_url}}

If payment is already on its way, please disregard this message.

Kind regards,
{{company_name}}`,
};

interface CandidateRow {
  id: string;
  company_id: string;
  sent_at: number;
  due_date: string;
  status: string;
  paid_at: number | null;
  reminders_paused: number;
  is_credit_note: number;
  reminder_count: number;
  last_reminder_at: number | null;
  invoice_reminder_days_after_due: number;
  invoice_reminder_repeat_days: number;
  invoice_reminder_max: number;
}

/**
 * Idempotent runner: scan open-and-overdue invoices, check per-company
 * schedule, send reminders die nog niet verzonden zijn. Aangeroepen vanaf
 * dashboard-load (throttled).
 */
export async function runInvoiceReminders(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  // Zorg dat status up-to-date is (sent → overdue waar van toepassing).
  markOverdueInvoices();

  const settings = getEmailSettings();
  if (!settings.postmark_server_token && !settings.test_mode) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         i.id, i.company_id, i.sent_at, i.due_date, i.status, i.paid_at,
         i.reminders_paused, i.is_credit_note,
         i.reminder_count, i.last_reminder_at,
         c.invoice_reminder_days_after_due,
         c.invoice_reminder_repeat_days,
         c.invoice_reminder_max
       FROM invoices i
       JOIN companies c ON c.id = i.company_id
       WHERE i.status IN ('sent','overdue')
         AND i.reminders_paused = 0
         AND i.is_credit_note = 0
         AND c.invoice_reminder_max > 0`,
    )
    .all() as CandidateRow[];

  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.reminder_count >= r.invoice_reminder_max) continue;

    const daysOverdue = daysBetween(r.due_date, today);
    if (daysOverdue < r.invoice_reminder_days_after_due) continue;

    // Bij 1e herinnering: due_date + days_after_due bereikt.
    // Bij volgende: last_reminder_at + repeat_days bereikt.
    if (r.reminder_count > 0 && r.last_reminder_at) {
      const daysSinceLast =
        (now - r.last_reminder_at) / (1000 * 60 * 60 * 24);
      if (daysSinceLast < r.invoice_reminder_repeat_days) continue;
    }

    try {
      await sendInvoiceReminder(r.id);
      sent++;
    } catch (err) {
      failed++;
      log.error(
        {
          scope: "accounting/invoice-reminders",
          err: err instanceof Error ? err.message : String(err),
          invoice_id: r.id,
        },
        "invoice reminder send failed",
      );
    }
  }

  return { processed: rows.length, sent, failed };
}

export async function sendInvoiceReminder(
  invoiceId: string,
): Promise<{ message_id: string }> {
  const settings = getEmailSettings();
  if (!settings.postmark_server_token && !settings.test_mode) {
    throw new Error("Postmark API token ontbreekt");
  }

  // Re-fetch met fresh status, ook al draait dit vanuit candidate-loop:
  // tussen candidate-query en send kan mollie webhook of bank-match de
  // status hebben gewijzigd. Defense-in-depth.
  const invoice = getInvoiceWithLines(invoiceId);
  if (!invoice) throw new Error("Factuur bestaat niet");
  if (invoice.status === "draft") {
    throw new Error("Concept-factuur kan geen herinnering krijgen");
  }
  if (invoice.status === "paid") {
    throw new Error("Factuur is al betaald");
  }
  if (invoice.status === "cancelled") {
    throw new Error("Geannuleerde factuur kan geen herinnering krijgen");
  }
  if (invoice.is_credit_note === 1) {
    throw new Error("Creditnota's krijgen geen herinneringen");
  }
  if (invoice.reminders_paused === 1) {
    throw new Error("Herinneringen zijn gepauzeerd voor deze factuur");
  }

  const { company, client } = getRenderContext(invoice);
  if (!company.sender_email) {
    throw new Error(
      `Geen sender-adres ingesteld voor ${company.name}. Vul het in bij het bedrijf.`,
    );
  }
  if (!client.email) {
    throw new Error("Klant heeft geen e-mailadres");
  }

  const lang: Lang = invoice.language === "en" ? "en" : "nl";
  const subjectTmpl =
    (lang === "en"
      ? company.invoice_reminder_subject_en
      : company.invoice_reminder_subject_nl) || DEFAULT_SUBJECT[lang];
  const bodyTmpl =
    (lang === "en"
      ? company.invoice_reminder_body_en
      : company.invoice_reminder_body_nl) || DEFAULT_BODY[lang];

  const today = new Date().toISOString().slice(0, 10);
  const daysOverdue = Math.max(0, daysBetween(invoice.due_date, today));
  const baseUrl = getAccountingBaseUrl();
  const viewUrl = invoice.public_token
    ? `${baseUrl}/invoice-view/${invoice.public_token}`
    : "";

  const vars: Record<string, string> = {
    client_name: client.name,
    company_name: company.name,
    invoice_number: invoice.number,
    total: formatEUR(invoice.total_cents),
    due_date: formatDate(invoice.due_date, lang),
    days_overdue: String(daysOverdue),
    view_url: viewUrl,
    pay_link: invoice.mollie_payment_url || "",
  };
  const substitute = (t: string) =>
    t.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
  const subject = substitute(subjectTmpl);
  const textBody = substitute(bodyTmpl);
  const htmlBody = textToHtml(textBody, company.accent_color || "#6366f1");

  const pdfBuffer = await renderInvoicePdf(invoiceId);

  let messageId = `test-${crypto.randomUUID()}`;
  if (settings.test_mode) {
    log.info(
      { scope: "accounting/invoice-reminders", test_mode: true, invoice_id: invoiceId },
      "test mode — reminder not actually sent",
    );
  } else {
    const pm = new ServerClient(settings.postmark_server_token);
    const res = await pm.sendEmail({
      From: `${company.name} <${company.sender_email}>`,
      To: client.email,
      ReplyTo: company.reply_to_email || undefined,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: "outbound",
      TrackOpens: true,
      TrackLinks: Models.LinkTrackingOptions.HtmlOnly,
      Metadata: {
        type: "invoice_reminder",
        invoice_id: invoiceId,
      },
      Attachments: [
        {
          Name: `${invoice.number}.pdf`,
          Content: pdfBuffer.toString("base64"),
          ContentType: "application/pdf",
          ContentID: "",
        },
      ],
    });
    messageId = res.MessageID;
  }

  // Bump counters + event-log
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE invoices SET
         reminder_count = reminder_count + 1,
         last_reminder_at = ?,
         updated_at = ?
       WHERE id = ?`,
    )
    .run(now, now, invoiceId);

  getDb()
    .prepare(
      `INSERT INTO invoice_events (id, invoice_id, type, payload_json, created_at)
       VALUES (?, ?, 'reminder_sent', ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      invoiceId,
      JSON.stringify({
        message_id: messageId,
        days_overdue: daysOverdue,
        count: invoice.reminder_count + 1,
      }),
      now,
    );

  return { message_id: messageId };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
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
