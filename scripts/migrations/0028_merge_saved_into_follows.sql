-- Collapse saved_bands + band_follows into one concept: following a band
-- (the heart). They were always structurally identical (see 0018) — the split
-- was semantic: saved = public bookmark, follow = notification subscription.
-- One heart now means both, so the union of the two tables becomes the
-- follow set, and everyone who had only saved a band starts receiving that
-- band's notifications (lib/notifications.ts fans out over band_follows).
--
-- band_follows wins as the surviving table because notifications already key
-- off it; migrating that side would mean rewriting those queries for no gain.
--
-- Deliberately NOT dropping saved_bands here. Migrations in this repo are
-- additive, and a drop in the same migration that ships the code change means
-- a code rollback lands on a table that no longer exists. After this deploys
-- and reads clean, a follow-up migration can drop it. Nothing reads
-- saved_bands once this ships.

-- Earliest of the two timestamps wins: if a user saved a band in January and
-- followed it in March, they've cared about it since January, and the profile
-- list is ordered by this column.
insert into band_follows (user_id, band_id, created_at)
select user_id, band_id, created_at from saved_bands
on conflict (user_id, band_id)
  do update set created_at = least(band_follows.created_at, excluded.created_at);

-- saved_bands had this index (for "how many users saved this band"); its twin
-- never did, and band_follows is now the table carrying that load — including
-- notifications.ts, which joins on band_id alone to fan out to a band's
-- followers. The primary key (user_id, band_id) can't serve that lookup.
create index if not exists band_follows_band_id_idx on band_follows (band_id);
