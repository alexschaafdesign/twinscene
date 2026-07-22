-- Birdhaus-sourced videos on band profiles.
--
-- The Birdhaus (thebirdhaus.org, Alex's house-show site, on a physically
-- separate Neon DB — see ARCHITECTURE.md) records every band's live set and
-- ties each video to a band and a show. Those get pulled into this `videos`
-- table by lib/importBirdhausVideos.ts (run manually and from the daily scrape
-- cron), mirroring the pull-based read the Birdhaus show scraper already does
-- via BIRDHAUS_DATABASE_URL — never a push from Birdhaus, per ARCHITECTURE.md.
--
-- Two additive changes:
--   1. `birdhaus` status, so these rows are distinguishable from the
--      UnderCurrentMPLS backfill ('auto') and hand-entered ('manual') sources
--      and can be re-synced idempotently without touching the others.
--   2. `source_url` — the Birdhaus show page a `birdhaus` row's credit line
--      links to ("Recorded at The Birdhaus"). Null for every other source.
alter table videos drop constraint videos_status_check;
alter table videos add constraint videos_status_check
  check (status in ('auto', 'review', 'created', 'manual', 'birdhaus'));

alter table videos add column if not exists source_url text;
