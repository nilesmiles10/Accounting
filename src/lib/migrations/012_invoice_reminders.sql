-- Automatische factuur-herinneringen.
-- Trigger: factuur-status in ('sent','overdue') én uitgaand (niet betaald,
-- niet geannuleerd). Per-bedrijf instelbaar, max N herinneringen totaal.

-- Per-bedrijf instellingen (alle defaults redelijk; 0 = feature uit).
ALTER TABLE companies ADD COLUMN invoice_reminder_days_after_due INTEGER NOT NULL DEFAULT 3;
ALTER TABLE companies ADD COLUMN invoice_reminder_repeat_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE companies ADD COLUMN invoice_reminder_max INTEGER NOT NULL DEFAULT 2;
ALTER TABLE companies ADD COLUMN invoice_reminder_subject_nl TEXT;
ALTER TABLE companies ADD COLUMN invoice_reminder_subject_en TEXT;
ALTER TABLE companies ADD COLUMN invoice_reminder_body_nl TEXT;
ALTER TABLE companies ADD COLUMN invoice_reminder_body_en TEXT;

-- Per-factuur tracking: aantal verstuurde herinneringen + laatste datum.
ALTER TABLE invoices ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN last_reminder_at INTEGER;
