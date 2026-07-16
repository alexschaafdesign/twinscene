-- Adds the band photo to the canonical Twin Scene `bands` table. Phase 2 of the
-- Birdhaus → Twin Scene migration moved the band records over but not their
-- photos; this column is where the backfill (scripts/migrate/backfill-band-
-- photos.mjs) lands them.
--
-- Birdhaus stores each photo as a full absolute URL on its own image host
-- (e.g. https://images.thebirdhaus.org/bands/<slug>.jpg), so a plain `text`
-- column holds the value verbatim with no domain-prefix logic needed. Nullable
-- because not every band has a photo (82 of 346 have none as of the backfill).
alter table bands add column photo text;
