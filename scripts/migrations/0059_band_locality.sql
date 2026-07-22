-- Local vs. touring designation for directory bands.
--
-- Twin Scene is the Twin Cities scene directory, but the bands table also
-- accumulates touring acts that pass through (matched/auto-created off scraped
-- show lineups). This column lets the directory default to LOCAL bands and the
-- shows list reserve its "Scene bands" badge for shows that actually feature a
-- local band — a touring-only show gets a distinct "Touring" badge instead.
--
--   'local'    — part of the Twin Cities scene
--   'touring'  — a visiting/out-of-town act
--   NULL       — unknown; TREATED AS LOCAL everywhere (display + badges), so a
--                band nobody has classified never silently drops out of the
--                default (local) directory view.
alter table bands add column if not exists locality text;

-- Backfill from the existing free-text city label. This is the Twin Cities
-- directory, so a Twin-Cities/MN city (or the catch-all "Twin Cities" /
-- "Minnesota" labels) is local. A city that's present but clearly elsewhere
-- (Duluth, Winona, out of state) is touring. A blank/null city is left NULL and
-- therefore shows as local by default — see the column note above.
update bands set locality = 'local'
where locality is null
  and lower(coalesce(city, '')) ~ 'minnea|mpls|st\.? *paul|saint paul|twin cities|minnesota|\bmn\b|bloomington|richfield|edina|st\.? *louis park|robbinsdale|golden valley|roseville|maplewood|hopkins|columbia heights|falcon heights|brooklyn (park|center)|crystal|new hope|fridley|shoreview|st\.? *anthony|little canada|new brighton|mendota|west st';

update bands set locality = 'touring'
where locality is null
  and coalesce(city, '') <> '';
