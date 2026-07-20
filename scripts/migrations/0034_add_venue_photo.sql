-- Adds a venue photo, mirroring bands' photo/thumbnail_url columns (0010,
-- 0015). Venues previously had no image at all — VenueIcon just rendered an
-- initials tile. Uploads land in R2 under venues/<slug>.<ext> /
-- venues/thumb/<slug>.jpg (lib/r2.ts's uploadVenuePhoto/uploadVenueThumbnail),
-- written by the venue submit route the same way band photos are.
--
-- Both nullable: most existing venues have no photo, and won't until someone
-- uploads one via a correction.
alter table venues add column photo text;
alter table venues add column thumbnail_url text;
