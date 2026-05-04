import { ServerClient, Models } from "postmark";
import { getEmailSettings } from "@/lib/settings";
import { getInvoiceWithLines, getRenderContext } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/pdf/render";
import { renderEmailTemplate } from "./templates";
import { getDb } from "@/lib/db";
import crypto from "crypto";
import { log } from "@/lib/logger";

export interface SendResult {
  message_id: string;
}

export async function sendInvoiceByEmail(
  invoiceId: string,
  override?: { to?: string; cc?: string },
): Promise<SendResult> {
  const settings = getEmailSettings();
  if (!settings.postmark_server_token) {
    throw new Error(
      "Postmark API token ontbreekt. Vul hem in bij Instellingen → E-mail.",
    );
  }

  const invoice = getInvoiceWithLines(invoiceId);
  if (!invoice) throw new Error("Factuur bestaat niet");
  if (invoice.status === "draft") {
    throw new Error("Concept kan niet verstuurd worden — finaliseer eerst");
  }
  if (invoice.status === "cancelled") {
    throw new Error("Geannuleerde factuur kan niet verstuurd worden");
  }

  const { company, client } = getRenderContext(invoice);

  if (!company.sender_email) {
    throw new Error(
      `Geen sender-adres ingesteld voor ${company.name}. Vul het in bij het bedrijf.`,
    );
  }
  const to = override?.to || client.email;
  if (!to) {
    throw new Error("Klant heeft geen e-mailadres en er is geen override");
  }

  const { subject, text, html } = renderEmailTemplate({
    invoice,
    company,
    client,
  });

  const pdfBuffer = await renderInvoicePdf(invoiceId);
  const filename = `${invoice.number}.pdf`;

  if (settings.test_mode) {
    // Pretend-send: log and return synthetic id. Useful during dev.
    log.info(
      {
        scope: "accounting/email",
        to,
        subject,
        invoice_id: invoiceId,
        test_mode: true,
      },
      "test mode — email not actually sent",
    );
    const fakeId = `test-${crypto.randomUUID()}`;
    persistSent(invoiceId, fakeId, to);
    return { message_id: fakeId };
  }

  const pm = new ServerClient(settings.postmark_server_token);
  try {
    const res = await pm.sendEmail({
      From: company.name
        ? `${company.name} <${company.sender_email}>`
        : company.sender_email,
      To: to,
      Cc: override?.cc,
      ReplyTo: company.reply_to_email || undefined,
      Subject: subject,
      HtmlBody: html,
      TextBody: text,
      MessageStream: "outbound",
      TrackOpens: true,
      TrackLinks: Models.LinkTrackingOptions.HtmlOnly,
      Metadata: { type: "invoice", invoice_id: invoiceId },
      Attachments: [
        {
          Name: filename,
          Content: pdfBuffer.toString("base64"),
          ContentType: "application/pdf",
          ContentID: "",
        },
      ],
    });
    persistSent(invoiceId, res.MessageID, to);
    return { message_id: res.MessageID };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ scope: "accounting/email", err: msg }, "postmark send failed");
    logInvoiceEvent(invoiceId, "email_failed", { error: msg, to });
    throw new Error(`Postmark: ${msg}`);
  }
}

function persistSent(
  invoiceId: string,
  messageId: string,
  to: string,
): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `UPDATE invoices SET postmark_message_id = ?, emailed_at = ?, updated_at = ? WHERE id = ?`,
  ).run(messageId, now, now, invoiceId);
  logInvoiceEvent(invoiceId, "emailed", { message_id: messageId, to });
}

function logInvoiceEvent(
  invoiceId: string,
  type: string,
  payload: unknown,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO invoice_events (id, invoice_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    invoiceId,
    type,
    JSON.stringify(payload),
    Date.now(),
  );
}
