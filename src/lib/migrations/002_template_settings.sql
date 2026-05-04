-- Per-company template styling. Safe defaults keep existing invoices visually
-- identical to phase 4 — accent_color already drove the main color.

ALTER TABLE companies ADD COLUMN header_style TEXT NOT NULL DEFAULT 'band';
-- 'band' | 'minimal' | 'logo_only'

ALTER TABLE companies ADD COLUMN font_family TEXT NOT NULL DEFAULT 'Helvetica';
-- 'Helvetica' | 'Times-Roman' | 'Courier' (react-pdf built-ins, no registration)

ALTER TABLE companies ADD COLUMN table_header_style TEXT NOT NULL DEFAULT 'accent';
-- 'accent' | 'dark' | 'minimal'

ALTER TABLE companies ADD COLUMN logo_position TEXT NOT NULL DEFAULT 'left';
-- 'left' | 'right'

ALTER TABLE companies ADD COLUMN logo_max_height INTEGER NOT NULL DEFAULT 60;

ALTER TABLE companies ADD COLUMN footer_text TEXT;
-- overrides auto-generated footer (KvK · BTW · IBAN) when non-null

ALTER TABLE companies ADD COLUMN show_footer_auto INTEGER NOT NULL DEFAULT 1;
-- 0|1: when 1 and footer_text empty, auto-generate from KvK/VAT/IBAN
