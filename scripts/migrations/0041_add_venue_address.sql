-- Add a street address to venues. Nullable and additive: existing rows keep a
-- null address, and the public venues API (`select *`) plus fetchVenues() pick
-- the column up automatically. Shared DB (Crawlspace reads venues) — additive
-- so nothing there breaks.
alter table venues add column if not exists address text;
