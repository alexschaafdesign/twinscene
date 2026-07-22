-- Reversible archive/hide for bands, venues, and shows. An admin can pull any
-- of these off the public site without destroying the row or its relationships
-- (a hard delete is unsafe here: videos.band_id has no cascade, and show.lineup
-- JSON embeds band slugs that would silently dangle). `hidden_at` null = visible;
-- a timestamp = hidden (and records when).
--
-- Additive and nullable, so existing rows stay visible and every `select *`
-- reader picks the column up automatically. Shared DB (Crawlspace reads
-- bands/venues/shows) — additive only, nothing there breaks. Public reads filter
-- `hidden_at is null`; admin reads pass through everything (see lib/bands.ts,
-- lib/venues.ts, lib/fetchShows.ts).
alter table bands  add column if not exists hidden_at timestamptz;
alter table venues add column if not exists hidden_at timestamptz;
alter table shows  add column if not exists hidden_at timestamptz;

create index if not exists idx_bands_hidden_at  on bands(hidden_at);
create index if not exists idx_venues_hidden_at on venues(hidden_at);
create index if not exists idx_shows_hidden_at  on shows(hidden_at);
