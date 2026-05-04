-- Email/Postmark configuration.
-- Global Postmark server token lives in the settings table; per-company
-- sender details live on companies (different sender signatures per brand).

ALTER TABLE companies ADD COLUMN sender_email TEXT;
ALTER TABLE companies ADD COLUMN reply_to_email TEXT;
ALTER TABLE companies ADD COLUMN email_subject_nl TEXT;
ALTER TABLE companies ADD COLUMN email_subject_en TEXT;
ALTER TABLE companies ADD COLUMN email_body_nl TEXT;
ALTER TABLE companies ADD COLUMN email_body_en TEXT;
-- email_body is a plain-text/markdown-lite template. Placeholders:
--   {{client_name}} {{invoice_number}} {{total}} {{due_date}} {{company_name}}

-- Add emailed_at tracker on invoices to distinguish "finalized" from "sent
-- via email". Existing postmark_message_id is the proof of delivery.
ALTER TABLE invoices ADD COLUMN emailed_at INTEGER;
