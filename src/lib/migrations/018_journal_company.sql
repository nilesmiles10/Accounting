-- Multi-bedrijf P&L: tot nu deelden Intersumma/Maelilly/Kisou één
-- grootboek per tenant. Voor losse P&L per bedrijf moet elke
-- journal_entry weten bij welk bedrijf 'ie hoort.
--
-- Voor BTW/balans gebruiken we company_id NIET als filter (BTW gaat
-- per BTW-nummer = per company maar suppletie-historie zit op tenant
-- niveau; balans is technisch per company maar voor MKB met 1 tenant
-- is een gecombineerde balans gangbaar).

ALTER TABLE journal_entries ADD COLUMN company_id TEXT;

CREATE INDEX IF NOT EXISTS idx_journal_company
  ON journal_entries(tenant_id, company_id, date);

-- Backfill: koppel bestaande boekingen aan hun bron-record.
-- Voor invoices: invoices.company_id
-- Voor purchases: purchase_invoices.company_id
-- Voor manual/opening/vat_submission: blijft NULL (gebruiker kan
-- later via journal-edit UI toewijzen, of we tonen het in
-- "ongekoppeld"-bucket op P&L per bedrijf).

UPDATE journal_entries
SET company_id = (
  SELECT i.company_id FROM invoices i WHERE i.id = journal_entries.source_id
)
WHERE source_type = 'invoice'
  AND company_id IS NULL;

UPDATE journal_entries
SET company_id = (
  SELECT p.company_id FROM purchase_invoices p
  WHERE p.id = journal_entries.source_id
)
WHERE source_type = 'purchase'
  AND company_id IS NULL;
