-- Phase 3, notifications: an in-app inbox. A user accrues notifications from
-- three sources (all fan-out-on-write from Twin Scene's own write paths):
--   'band_show'    a band the user follows was put on a new (future) show
--   'band_update'  a band the user follows edited its profile
--   'show_changed' a show the user saved (interested/going) changed date/venue
-- Delivery is in-app only for now; email digests can later read unread rows,
-- so this schema deliberately leaves that seam clean (no email plumbing here).
--
-- Same shared Neon DB as bands/shows/users. This table is Twin-Scene-owned;
-- Crawlspace doesn't read or write it. Column types follow the rest of the
-- schema: users.id / bands.id are bigint, shows.id is uuid (see 0001/0009/0016).
-- band_id / show_id are nullable because which one is set depends on `type`.
create table notifications (
  id         bigserial   primary key,
  user_id    bigint      not null references users(id) on delete cascade,
  type       text        not null,
  band_id    bigint      references bands(id) on delete cascade,
  show_id    uuid        references shows(id) on delete cascade,
  -- Render payload that isn't reconstructable from the join (e.g. which fields
  -- an edit touched: {"changed":["bio","photo"]}). null for types that need none.
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The inbox list: a user's notifications, newest first.
create index notifications_user_created_idx on notifications (user_id, created_at desc);

-- The unread badge count — a partial index so counting unread never scans read rows.
create index notifications_user_unread_idx on notifications (user_id) where read_at is null;

-- Dedup for 'band_show': "this band is on this show" is a permanent fact, so a
-- user is notified at most once per (band, show) EVER — even after they've read
-- it, and no matter how many nightly re-scrapes touch the show. Fan-out inserts
-- with ON CONFLICT DO NOTHING against this index.
create unique index notifications_band_show_uniq
  on notifications (user_id, band_id, show_id)
  where type = 'band_show';

-- Coalesce for 'band_update': while an update notification is still unread,
-- further edits to the same band bump the existing row (timestamp + changed
-- fields) instead of piling up — an editor saving three times doesn't spam
-- followers with three rows. Once read, the next edit earns a fresh row (the
-- read_at IS NULL predicate stops matching), so the read_at column is part of
-- the index predicate. Fan-out uses ON CONFLICT ... DO UPDATE.
create unique index notifications_band_update_unread_uniq
  on notifications (user_id, band_id)
  where type = 'band_update' and read_at is null;

-- Coalesce for 'show_changed', same idea keyed on (user, show): repeated edits
-- to a saved show collapse into one unread notification until it's read.
create unique index notifications_show_changed_unread_uniq
  on notifications (user_id, show_id)
  where type = 'show_changed' and read_at is null;
