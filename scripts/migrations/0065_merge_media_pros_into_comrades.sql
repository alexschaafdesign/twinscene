-- Merge the standalone Photo/Video directory (media_pros, 0031/0032) into the
-- Comrades directory (comrades, 0064). Photographers/videographers were always
-- just "scene people who aren't bands/musicians" — the same thing comrades is —
-- so they collapse into a single `photo_video` category rather than a parallel
-- table + parallel editor/claim/submit/admin stack.
--
-- Two parts, both additive & idempotent-friendly:
--   1. Extend comrades to hold everything a media_pro had: the new category
--      value, plus the portfolio_url + gallery columns (the only fields
--      media_pros had that comrades didn't).
--   2. Copy media_pros rows + their editors + their claims into the comrades
--      tables, mapping role -> 'photo_video' and preserving slugs (so old
--      /photo-video/<slug> URLs redirect cleanly to /comrades/<slug>, and so we
--      can join the editor/claim rows back by slug).
--
-- Non-destructive: media_pros / media_pro_editors / media_pro_claims are left
-- in place, orphaned, exactly like saved_bands after 0028 — dropping a table in
-- the same migration that ships the code removing its last reader means a
-- rollback lands on a missing table. A later migration drops them.
--
-- NOTE: assumes `comrades` is empty of any slug that also exists in media_pros
-- (true on dev and prod — comrades has not shipped yet). If that ever stops
-- holding, the slug-collision would surface as a unique-violation here.
--
-- The runner (scripts/migrate.mjs) already wraps each file in a transaction, so
-- there's deliberately no BEGIN/COMMIT here.

-- 1a. Allow the new category value.
alter table comrades drop constraint if exists comrades_category_check;
alter table comrades add constraint comrades_category_check check (category in (
  'recording_studio', 'record_label', 'rehearsal_space', 'sound_production',
  'record_store', 'promoter_collective', 'photo_video', 'other'
));

-- 1b. Fields media_pros had that comrades didn't.
alter table comrades add column if not exists portfolio_url text;
alter table comrades add column if not exists gallery text[] not null default '{}';
alter table comrades drop constraint if exists comrades_gallery_max_5;
alter table comrades add constraint comrades_gallery_max_5
  check (array_length(gallery, 1) is null or array_length(gallery, 1) <= 5);

-- 2a. Copy the listings. tagline stays null (media_pros had none); the grid
--     card falls back to "Photo / Video · City" for those.
insert into comrades (
  slug, name, category, tagline, bio, city, website, instagram, contact,
  portfolio_url, photo, thumbnail_url, gallery, created_at, updated_at
)
select
  slug, name, 'photo_video', null, bio, city, website, instagram, contact,
  portfolio_url, photo, thumbnail_url, gallery, created_at, updated_at
from media_pros
on conflict (slug) do nothing;

-- 2b. Editors — map media_pro_id -> comrade id by the preserved slug.
insert into comrade_editors (user_id, comrade_id, role, created_at)
select e.user_id, c.id, e.role, e.created_at
from media_pro_editors e
join media_pros m on m.id = e.media_pro_id
join comrades c on c.slug = m.slug
on conflict (user_id, comrade_id) do nothing;

-- 2c. Claims — same mapping. The partial unique index (one pending per
--     user+row) is satisfied since comrade_claims starts empty for these rows.
insert into comrade_claims (user_id, comrade_id, status, created_at, decided_at, decided_by)
select cl.user_id, c.id, cl.status, cl.created_at, cl.decided_at, cl.decided_by
from media_pro_claims cl
join media_pros m on m.id = cl.media_pro_id
join comrades c on c.slug = m.slug;
