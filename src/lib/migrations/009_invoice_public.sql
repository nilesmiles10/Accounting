-- Publieke view-token voor facturen (spiegel van 006_quote_public).
-- Klant kan factuur online bekijken + PDF + betalen via Mollie-link
-- zonder Nova-login.

ALTER TABLE invoices ADD COLUMN public_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token
  ON invoices(public_token)
  WHERE public_token IS NOT NULL;
