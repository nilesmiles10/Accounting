-- Immutable snapshots of company + client at the moment of finalize.
-- After finalize, PDFs are rendered from these snapshots so later edits to
-- the company/client record don't rewrite history. Drafts have NULL here
-- and continue to render from live data.
--
-- Stored as JSON (full row dump) for forward-compat — later template changes
-- can still drive how the snapshot is laid out, but the data is frozen.

ALTER TABLE invoices ADD COLUMN company_snapshot_json TEXT;
ALTER TABLE invoices ADD COLUMN client_snapshot_json TEXT;
