-- Blanket per-venue age policies, editable from /admin/venues.
--
-- Some venues have a house age policy their calendar doesn't state per-event
-- (e.g. White Squirrel is 21+ for any show starting at/after 8pm). This table
-- holds that policy so the scrape pipeline can tag shows with it, and an admin
-- can add/change one per venue without a deploy.
--
-- Keyed by venue_name (the exact text shows carry in shows.venue_name and the
-- scrapers emit as `venue`), so both scrape-time tagging and the backfill match
-- rows directly with no join — mirroring how shows already reference venues by
-- name string, not FK.
--
-- restriction: the label to apply ("21+", "18+", "All Ages").
-- applies_after: nullable time-of-day gate. NULL = the rule fires for every show
--   at the venue; a time = it fires only for shows starting at/after that clock
--   time (a show with no known start time is left alone, same as scrape-time).
create table venue_age_rules (
  venue_name    text primary key,
  restriction   text not null,
  applies_after time,
  updated_at    timestamptz not null default now()
);

-- Seed the White Squirrel rule this feature replaced in code (21+ from 8pm on).
insert into venue_age_rules (venue_name, restriction, applies_after)
values ('White Squirrel Bar', '21+', '20:00')
on conflict (venue_name) do nothing;
