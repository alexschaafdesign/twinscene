-- Removing a video from a band's profile used to hard-delete the row
-- (lib/videos.ts removeVideos) — fine for a submitter's own typo'd link, but
-- unrecoverable for a scraper-matched (UnderCurrentMPLS) video: re-attaching
-- one means re-running the backfill and hoping the title still parses the
-- same way. `hidden` replaces delete with a reversible toggle: hidden videos
-- stay in the table (so a future backfill run's `on conflict (video_url) do
-- nothing` still treats them as present, not missing) and are just excluded
-- from the band's live profile. Additive, defaults false.
alter table videos add column if not exists hidden boolean not null default false;
