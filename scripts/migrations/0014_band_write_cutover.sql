-- Cuts the band "Add your band" / "Edit this band" form over from the legacy
-- Google Apps Script (writes to a Sheet nothing reads anymore) to writing
-- directly into this table, mirroring the Shows feature's existing DB-backed
-- submit path. Adds the columns the form already collects but that never had
-- a home in `bands` (members/contact fields were dropped by the Phase 2
-- migration's column mapping), and widens `videos.status` so the form can
-- attach hand-entered videos alongside the scraper-backfilled ones.
--
--   members         — band member names, jsonb array of strings, mirrors the
--                     `neighborhoods` column's shape. Optional, may be empty.
--   contact_email   — public contact address shown on the profile.
--   contact_method  — "" | "email" | "instagram" | "website".
alter table bands
  add column members       jsonb,
  add column contact_email text,
  add column contact_method text;

-- 'manual': a video a submitter pasted directly into the edit form, as
-- opposed to 'auto'/'review'/'created' which all come from the scraper
-- backfill's title-matching pipeline (scripts/undercurrent-backfill.ts).
alter table videos drop constraint videos_status_check;
alter table videos add constraint videos_status_check
  check (status in ('auto', 'review', 'created', 'manual'));
