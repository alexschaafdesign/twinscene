-- One-time backfill target for the UnderCurrentMPLS YouTube channel video
-- matcher (scripts/undercurrent-backfill.ts). Mirrors `bands`' bigserial-id,
-- snake_case convention.
--
-- `status` is the only tier column — rows below the review threshold aren't
-- inserted at all (they land in the script's local unmatched.json instead),
-- so there's nothing a separate `confidence` column would add.
--
-- Unique on video_url so re-running the backfill against the same fetched
-- video list is a no-op on already-inserted rows (ON CONFLICT DO NOTHING).
create table videos (
  id              bigserial primary key,
  band_id         bigint references bands(id),
  video_title     text not null,
  video_url       text not null unique,
  published_date  date,
  match_score     real not null,
  status          text not null check (status in ('auto', 'review')),
  created_at      timestamptz not null default now()
);

create index idx_videos_band_id on videos(band_id);
