-- Store geocoded coordinates on venues so we can plot them on a map and, later,
-- order shows by how close their venue is to a user. Nullable and additive:
-- existing rows keep null coords until backfilled (scripts/backfill-venue-
-- coords.mjs), and the public venues API (`select *`) plus fetchVenues() pick
-- the columns up automatically. Private-address venues stay null — we never
-- geocode a withheld address. Shared DB (Crawlspace reads venues) — additive
-- only, so nothing there breaks.
alter table venues add column if not exists lat double precision;
alter table venues add column if not exists lng double precision;
