-- Manually-set display fields for the new shared venue-avatar treatment
-- (textured background, hue-shifted per slug, initials on top) replacing the
-- old logo/photo/gray-initials mix on grid cards. Both nullable and start
-- empty — no backfill; short_name falls back to name, avatar_initials falls
-- back to an auto-derive from name, until someone fills these in via the
-- venue edit form. Additive only. Shared DB (Crawlspace reads venues).
alter table venues add column if not exists short_name text;
alter table venues add column if not exists avatar_initials text;
