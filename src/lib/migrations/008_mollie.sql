-- Mollie-betaallink per factuur.
-- mollie_payment_id is de ID die Mollie teruggeeft bij payment-create.
-- mollie_payment_url is de hosted checkout-URL (iDEAL/creditcard).
-- mollie_status is onze cache van de laatst bekende Mollie-status
-- (open/pending/paid/failed/expired/canceled). Webhook updatet 'm.

ALTER TABLE invoices ADD COLUMN mollie_payment_id TEXT;
ALTER TABLE invoices ADD COLUMN mollie_payment_url TEXT;
ALTER TABLE invoices ADD COLUMN mollie_status TEXT;
ALTER TABLE invoices ADD COLUMN mollie_paid_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_invoices_mollie_payment
  ON invoices(mollie_payment_id)
  WHERE mollie_payment_id IS NOT NULL;
