-- Logistics text (doors/music times, prices) and the scraped poster image —
-- both actively rendered on the public shows timeline and edited through
-- ShowSubmitForm/ShowImportReview, so they're first-class columns rather than
-- buried in the raw jsonb lineage blob.
ALTER TABLE shows ADD COLUMN notes text;
ALTER TABLE shows ADD COLUMN flyer_url text;

-- Backfill from the raw sheet-row snapshot every row already carries.
UPDATE shows SET
  notes = NULLIF(raw->>'NOTES', ''),
  flyer_url = NULLIF(raw->>'FLYER', '')
WHERE raw IS NOT NULL;
