import { getDb } from "@/lib/db";
import { getCurrentTenantId } from "@/lib/tenant";

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  kvk: string | null;
  vat_number: string | null;
  iban: string | null;
  bic: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  logo_path: string | null;
  accent_color: string;
  default_language: "nl" | "en";
  default_payment_terms_days: number;
  default_terms_text: string | null;
  invoice_number_prefix: string;
  invoice_number_next: number;
  invoice_number_padding: number;
  header_style: "band" | "minimal" | "logo_only";
  font_family: "Helvetica" | "Times-Roman" | "Courier";
  table_header_style: "accent" | "dark" | "minimal";
  logo_position: "left" | "right";
  logo_max_height: number;
  footer_text: string | null;
  show_footer_auto: number;
  sender_email: string | null;
  reply_to_email: string | null;
  email_subject_nl: string | null;
  email_subject_en: string | null;
  email_body_nl: string | null;
  email_body_en: string | null;
  quote_number_prefix: string;
  quote_number_next: number;
  quote_number_padding: number;
  default_quote_validity_days: number;
  quote_signature_line_nl: string | null;
  quote_signature_line_en: string | null;
  reminder_days_after_send: number;
  reminder_days_before_expiry: number;
  reminder_subject_nl: string | null;
  reminder_subject_en: string | null;
  reminder_body_nl: string | null;
  reminder_body_en: string | null;
  expiry_subject_nl: string | null;
  expiry_subject_en: string | null;
  expiry_body_nl: string | null;
  expiry_body_en: string | null;
  quote_email_subject_nl: string | null;
  quote_email_subject_en: string | null;
  quote_email_body_nl: string | null;
  quote_email_body_en: string | null;
  owner_notify_accepted_subject: string | null;
  owner_notify_accepted_body: string | null;
  owner_notify_rejected_subject: string | null;
  owner_notify_rejected_body: string | null;
  invoice_reminder_days_after_due: number;
  invoice_reminder_repeat_days: number;
  invoice_reminder_max: number;
  invoice_reminder_subject_nl: string | null;
  invoice_reminder_subject_en: string | null;
  invoice_reminder_body_nl: string | null;
  invoice_reminder_body_en: string | null;
  created_at: number;
  updated_at: number;
}

export type CompanyUpdate = Partial<Omit<Company, "id" | "created_at" | "updated_at">>;

const UPDATABLE: (keyof CompanyUpdate)[] = [
  "name",
  "legal_name",
  "kvk",
  "vat_number",
  "iban",
  "bic",
  "email",
  "phone",
  "website",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "country",
  "logo_path",
  "accent_color",
  "default_language",
  "default_payment_terms_days",
  "default_terms_text",
  "invoice_number_prefix",
  "invoice_number_next",
  "invoice_number_padding",
  "header_style",
  "font_family",
  "table_header_style",
  "logo_position",
  "logo_max_height",
  "footer_text",
  "show_footer_auto",
  "sender_email",
  "reply_to_email",
  "email_subject_nl",
  "email_subject_en",
  "email_body_nl",
  "email_body_en",
  "quote_number_prefix",
  "quote_number_next",
  "quote_number_padding",
  "default_quote_validity_days",
  "quote_signature_line_nl",
  "quote_signature_line_en",
  "reminder_days_after_send",
  "reminder_days_before_expiry",
  "reminder_subject_nl",
  "reminder_subject_en",
  "reminder_body_nl",
  "reminder_body_en",
  "expiry_subject_nl",
  "expiry_subject_en",
  "expiry_body_nl",
  "expiry_body_en",
  "quote_email_subject_nl",
  "quote_email_subject_en",
  "quote_email_body_nl",
  "quote_email_body_en",
  "owner_notify_accepted_subject",
  "owner_notify_accepted_body",
  "owner_notify_rejected_subject",
  "owner_notify_rejected_body",
  "invoice_reminder_days_after_due",
  "invoice_reminder_repeat_days",
  "invoice_reminder_max",
  "invoice_reminder_subject_nl",
  "invoice_reminder_subject_en",
  "invoice_reminder_body_nl",
  "invoice_reminder_body_en",
];

export function listCompanies(): Company[] {
  return getDb()
    .prepare("SELECT * FROM companies WHERE tenant_id = ? ORDER BY name")
    .all(getCurrentTenantId()) as Company[];
}

export function getCompany(id: string): Company | null {
  const row = getDb()
    .prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?")
    .get(id, getCurrentTenantId()) as Company | undefined;
  return row ?? null;
}

export function createCompany(input: { id: string; name: string } & CompanyUpdate): Company {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO companies (id, tenant_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(input.id, getCurrentTenantId(), input.name, now, now);
  if (Object.keys(input).length > 2) {
    updateCompany(input.id, input);
  }
  return getCompany(input.id)!;
}

export function updateCompany(id: string, patch: CompanyUpdate): Company | null {
  const db = getDb();
  const fields = UPDATABLE.filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return getCompany(id);

  const setSql = fields.map((k) => `${k} = ?`).join(", ");
  const values = fields.map((k) => patch[k] as unknown);
  db.prepare(
    `UPDATE companies SET ${setSql}, updated_at = ? WHERE id = ?`,
  ).run(...values, Date.now(), id);
  return getCompany(id);
}

export function deleteCompany(id: string): boolean {
  const db = getDb();
  const inUse = db
    .prepare("SELECT COUNT(*) AS n FROM invoices WHERE company_id = ?")
    .get(id) as { n: number };
  if (inUse.n > 0) {
    throw new Error("Bedrijf heeft facturen en kan niet worden verwijderd");
  }
  const res = db.prepare("DELETE FROM companies WHERE id = ?").run(id);
  return res.changes > 0;
}
