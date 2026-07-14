-- Data-quality review flags computed by lib/scrapers/reviewFlags.ts at
-- import time — QA signal, not a publish gate (flagged shows still go
-- public; see upsertScrapedShow in lib/shows.ts). needs_review/confidence/
-- review_reasons are recomputed on every re-scrape; reviewed_at is set only
-- by a human clearing the flag in the review UI (Phase 3) and upsertScrapedShow
-- never sets it and stops touching the other three once it's set — mirrors
-- the edited_at lock, but scoped to review status instead of the whole row.
ALTER TABLE shows ADD COLUMN needs_review boolean DEFAULT false;
ALTER TABLE shows ADD COLUMN confidence text;
ALTER TABLE shows ADD COLUMN review_reasons jsonb DEFAULT '[]';
ALTER TABLE shows ADD COLUMN reviewed_at timestamptz;
