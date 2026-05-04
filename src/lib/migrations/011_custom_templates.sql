-- Alle resterende email-templates per bedrijf aanpasbaar.
-- Bestaande velden (invoice email_subject/body, reminder_subject/body,
-- expiry_subject/body) blijven zoals ze zijn.

-- Offerte-verzending (klant)
ALTER TABLE companies ADD COLUMN quote_email_subject_nl TEXT;
ALTER TABLE companies ADD COLUMN quote_email_subject_en TEXT;
ALTER TABLE companies ADD COLUMN quote_email_body_nl TEXT;
ALTER TABLE companies ADD COLUMN quote_email_body_en TEXT;

-- Eigenaar-notificatie bij accept (intern; geen talen, jij leest 't)
ALTER TABLE companies ADD COLUMN owner_notify_accepted_subject TEXT;
ALTER TABLE companies ADD COLUMN owner_notify_accepted_body TEXT;
-- Eigenaar-notificatie bij afwijzing
ALTER TABLE companies ADD COLUMN owner_notify_rejected_subject TEXT;
ALTER TABLE companies ADD COLUMN owner_notify_rejected_body TEXT;
