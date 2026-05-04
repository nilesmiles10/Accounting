import type { Company } from "@/lib/companies";
import type { Client } from "@/lib/clients";
import type { InvoiceWithLines } from "@/lib/invoices";
import { formatEUR } from "@/lib/format";
import { formatDate } from "@/lib/format";
import { getAccountingBaseUrl } from "@/lib/branding";

type Lang = "nl" | "en";

const DEFAULT_SUBJECT: Record<Lang, string> = {
  nl: "Factuur {{invoice_number}} — {{company_name}}",
  en: "Invoice {{invoice_number}} — {{company_name}}",
};

const DEFAULT_BODY: Record<Lang, string> = {
  nl: `Beste {{client_name}},

Bijgevoegd vind je factuur {{invoice_number}} voor een bedrag van {{total}}.

Bekijk de factuur online (en betaal direct indien gewenst):
{{view_url}}

Graag ontvangen we de betaling uiterlijk {{due_date}}.

Met vriendelijke groet,
{{company_name}}`,
  en: `Dear {{client_name}},

Please find attached invoice {{invoice_number}} for an amount of {{total}}.

Review the invoice online (and pay directly if you prefer):
{{view_url}}

Kindly settle the payment by {{due_date}}.

Kind regards,
{{company_name}}`,
};

export function renderEmailTemplate({
  invoice,
  company,
  client,
}: {
  invoice: InvoiceWithLines;
  company: Company;
  client: Client;
}): { subject: string; text: string; html: string } {
  const lang: Lang = invoice.language === "en" ? "en" : "nl";

  const subjectTmpl =
    (lang === "en" ? company.email_subject_en : company.email_subject_nl) ||
    DEFAULT_SUBJECT[lang];
  const bodyTmpl =
    (lang === "en" ? company.email_body_en : company.email_body_nl) ||
    DEFAULT_BODY[lang];

  const payLink = invoice.mollie_payment_url || "";
  const payLinkBlock = payLink
    ? lang === "en"
      ? `Pay online directly (iDEAL / card): ${payLink}\n\n`
      : `Betaal direct online (iDEAL / creditcard): ${payLink}\n\n`
    : "";
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
    pay_link: payLink,
    pay_link_block: payLinkBlock,
    view_url: viewUrl,
    issue_date: formatDate(invoice.issue_date, lang),
    reference: invoice.reference || "",
  };

  const subject = substitute(subjectTmpl, vars);
  const text = substitute(bodyTmpl, vars);
  const html = textToHtml(text, company.accent_color || "#6366f1");

  return { subject, text, html };
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
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Email</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" style="width:100%;background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${accent};height:4px;"></td></tr>
        <tr><td style="padding:32px;font-size:14px;color:#111827;">${paragraphs}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export const TEMPLATE_PLACEHOLDERS = [
  "client_name",
  "company_name",
  "invoice_number",
  "total",
  "due_date",
  "issue_date",
  "reference",
];

export { DEFAULT_BODY, DEFAULT_SUBJECT };
