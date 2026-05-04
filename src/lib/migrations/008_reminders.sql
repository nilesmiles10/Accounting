-- Follow-up reminders voor offertes + Postmark open/click tracking.

-- Per-bedrijf reminder-instellingen.
-- 0 = uitgeschakeld. Reminder stuurt X dagen na sent, expiry warning
-- Y dagen vóór valid_until_date. Beide max 1× per offerte.
ALTER TABLE companies ADD COLUMN reminder_days_after_send INTEGER NOT NULL DEFAULT 7;
ALTER TABLE companies ADD COLUMN reminder_days_before_expiry INTEGER NOT NULL DEFAULT 3;
ALTER TABLE companies ADD COLUMN reminder_subject_nl TEXT;
ALTER TABLE companies ADD COLUMN reminder_subject_en TEXT;
ALTER TABLE companies ADD COLUMN reminder_body_nl TEXT;
ALTER TABLE companies ADD COLUMN reminder_body_en TEXT;
ALTER TABLE companies ADD COLUMN expiry_subject_nl TEXT;
ALTER TABLE companies ADD COLUMN expiry_subject_en TEXT;
ALTER TABLE companies ADD COLUMN expiry_body_nl TEXT;
ALTER TABLE companies ADD COLUMN expiry_body_en TEXT;

-- Quote-niveau tracking.
ALTER TABLE quotes ADD COLUMN reminder_sent_at INTEGER;
ALTER TABLE quotes ADD COLUMN expiry_warning_sent_at INTEGER;
ALTER TABLE quotes ADD COLUMN open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN last_opened_at INTEGER;
ALTER TABLE quotes ADD COLUMN link_click_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN last_clicked_at INTEGER;

-- Zelfde tracking op invoices (waarde voor facturen ook relevant).
ALTER TABLE invoices ADD COLUMN open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN last_opened_at INTEGER;
ALTER TABLE invoices ADD COLUMN link_click_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN last_clicked_at INTEGER;
