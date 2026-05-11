-- Per-invoice flag om automatische herinneringen te pauzeren. Gebruikt
-- voor invoices waar de klant heeft toegezegd binnenkort te betalen,
-- waar een afbetalingsregeling is gemaakt, of waar de gebruiker simpel
-- handmatig wil sturen wanneer (geen) reminder gaat.

ALTER TABLE invoices ADD COLUMN reminders_paused INTEGER NOT NULL DEFAULT 0;

-- Index voor de reminder-candidate query
CREATE INDEX IF NOT EXISTS idx_invoices_reminder_state
  ON invoices(tenant_id, status, reminders_paused)
  WHERE status IN ('sent', 'overdue') AND reminders_paused = 0;
