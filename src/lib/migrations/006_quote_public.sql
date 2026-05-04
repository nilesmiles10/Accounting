-- Publieke klik-accepteer flow.
-- Bij finalize krijgt een offerte een onraadbaar token waarmee de klant
-- zonder login kan inzien + accepteren/afwijzen.

ALTER TABLE quotes ADD COLUMN public_token TEXT;
ALTER TABLE quotes ADD COLUMN accepted_by_name TEXT;
ALTER TABLE quotes ADD COLUMN accepted_by_ip TEXT;
ALTER TABLE quotes ADD COLUMN rejected_by_name TEXT;
ALTER TABLE quotes ADD COLUMN rejected_by_ip TEXT;
ALTER TABLE quotes ADD COLUMN rejected_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_public_token ON quotes(public_token)
  WHERE public_token IS NOT NULL;
