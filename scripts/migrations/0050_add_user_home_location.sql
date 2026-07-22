-- A user's saved home location, used to sort shows by how close each venue is
-- to them ("shows tonight, nearest first"). home_address is what they typed;
-- home_lat/home_lng are geocoded from it on save (free US Census geocoder,
-- same path as venues). All nullable and additive — existing users keep null
-- and the feature is simply unavailable until they set an address. Private:
-- never exposed on public profiles (scrubUser hands the whole User around, but
-- the public profile projection selects an explicit column list). Shared DB
-- (auth/user tables are shared with Crawlspace) — additive only, nothing there
-- breaks.
alter table users add column if not exists home_address text;
alter table users add column if not exists home_lat double precision;
alter table users add column if not exists home_lng double precision;
