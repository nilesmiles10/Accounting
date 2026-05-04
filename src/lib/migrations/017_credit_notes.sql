-- Creditnota's: een verkoopfactuur met negatieve bedragen die naar een
-- bestaande factuur verwijst. Krijgt eigen sequenter nummer (zelfde
-- serie als facturen, dus geen gat in de nummering). De PDF heet
-- "Creditnota", de boeking is debet 8xxx / credit 1300 (omgekeerd
-- van een gewone factuur). BTW-rubriek 1a/1b krijgt negatieve waarde
-- waarmee de aangifte automatisch corrigeert.

ALTER TABLE invoices ADD COLUMN is_credit_note INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN credits_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_credit_note
  ON invoices(is_credit_note) WHERE is_credit_note = 1;
CREATE INDEX IF NOT EXISTS idx_invoices_credits
  ON invoices(credits_invoice_id) WHERE credits_invoice_id IS NOT NULL;
