-- Phase 2b of the Birdhaus → Twin Scene migration. Phase 2 carried band
-- identity + text (name, slug, genre, socials, bio, hometown) and 0010 added
-- the photo; this migration adds the remaining profile fields the band-profile
-- UI renders, so Twin Scene's own /api/public/bands can fully replace Birdhaus
-- as the frontend's source with no regressions.
--
-- Backfilled from Birdhaus by scripts/migrate/backfill-band-profile-fields.mjs.
-- Instagram/website/bandcamp already live in `socials` (Phase 2) and are not
-- touched here.
--
--   city                 — home city label, e.g. "Minneapolis" (231 bands)
--   neighborhoods        — finer-grained areas, jsonb array of strings; mirrors
--                          the `socials` jsonb shape. Sparse (5 bands).
--   bandcamp_embed_url   — resolved Bandcamp EmbeddedPlayer URL for the profile
--   bandcamp_embed_height— iframe height in px for that embed (13 bands)
--   featured_links       — band-curated highlight cards, jsonb array of
--                          { url, label, image }. Sparse (2 bands).
alter table bands
  add column city                  text,
  add column neighborhoods         jsonb,
  add column bandcamp_embed_url    text,
  add column bandcamp_embed_height integer,
  add column featured_links        jsonb;
