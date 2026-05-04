-- Wanneer ingeschakeld wordt er bij publieke accept direct een factuur
-- gegenereerd + Mollie-betaallink. Default: uit — status blijft 'accepted'
-- en admin converteert zelf wanneer werk klaar is.

ALTER TABLE quotes ADD COLUMN auto_invoice_on_accept INTEGER NOT NULL DEFAULT 0;
